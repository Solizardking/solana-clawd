#include "orelane.h"

#include <string.h>

#include "connect.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/task.h"

typedef struct {
    size_t payload_len;
    char payload[1024];
} orelane_bundle_t;

static const char *TAG = "orelane";

static GlobalState *s_global_state = NULL;
static QueueHandle_t s_bundle_queue = NULL;
static orelane_policy_t s_policy = {
    .mode = ORELANE_MODE_PAPER,
    .max_temp_c = 72,
    .max_cpu_percent = 75,
    .min_wifi_rssi = -75,
    .min_free_heap = 150000,
};
static orelane_snapshot_t s_snapshot = {0};

static bool orelane_is_healthy(void) {
    if (s_global_state == NULL) {
        return false;
    }

    int8_t rssi = -90;
    (void)get_wifi_current_rssi(&rssi);

    if (s_global_state->SYSTEM_MODULE.mining_paused) {
        return false;
    }
    if (s_global_state->POWER_MANAGEMENT_MODULE.chip_temp_avg > s_policy.max_temp_c) {
        return false;
    }
    if (s_global_state->SYSTEM_MODULE.cpu_usage > s_policy.max_cpu_percent) {
        return false;
    }
    if (esp_get_free_heap_size() < s_policy.min_free_heap) {
        return false;
    }
    if (rssi < s_policy.min_wifi_rssi) {
        return false;
    }

    return true;
}

static void orelane_refresh_snapshot(void) {
    if (s_global_state == NULL) {
        return;
    }

    int8_t rssi = -90;
    (void)get_wifi_current_rssi(&rssi);

    s_snapshot.healthy = orelane_is_healthy();
    s_snapshot.mining_paused = s_global_state->SYSTEM_MODULE.mining_paused;
    s_snapshot.chip_temp_c = s_global_state->POWER_MANAGEMENT_MODULE.chip_temp_avg;
    s_snapshot.vr_temp_c = s_global_state->POWER_MANAGEMENT_MODULE.vr_temp;
    s_snapshot.cpu_percent = s_global_state->SYSTEM_MODULE.cpu_usage;
    s_snapshot.wifi_rssi = rssi;
    s_snapshot.free_heap = esp_get_free_heap_size();
    s_snapshot.hashrate_1m = s_global_state->SYSTEM_MODULE.hashrate_1m;
    s_snapshot.power_watts = s_global_state->POWER_MANAGEMENT_MODULE.power;

    if (s_snapshot.healthy) {
        strncpy(s_snapshot.last_status, "ready", sizeof(s_snapshot.last_status) - 1);
    } else {
        strncpy(s_snapshot.last_status, "safety-hold", sizeof(s_snapshot.last_status) - 1);
    }
}

static void orelane_dispatch_bundle(const orelane_bundle_t *bundle) {
    if (bundle == NULL) {
        return;
    }

    if (!orelane_is_healthy()) {
        ESP_LOGW(TAG, "Rejected ORE bundle because safety gate is active");
        return;
    }

    s_snapshot.last_bundle_at_ms = esp_timer_get_time() / 1000;

    switch (s_policy.mode) {
        case ORELANE_MODE_DISABLED:
            ESP_LOGI(TAG, "ORELANE disabled; dropping bundle");
            return;
        case ORELANE_MODE_PAPER:
            ESP_LOGI(TAG, "PAPER bundle received (%u bytes): %.64s", (unsigned)bundle->payload_len, bundle->payload);
            return;
        case ORELANE_MODE_SIGNED_BUNDLE:
            ESP_LOGI(TAG, "SIGNED_BUNDLE received (%u bytes)", (unsigned)bundle->payload_len);
            ESP_LOGW(TAG, "TODO: relay signed bundle to Solana RPC or local proxy");
            return;
        default:
            return;
    }
}

static void orelane_task(void *pvParameters) {
    (void)pvParameters;
    orelane_bundle_t bundle;

    while (1) {
        orelane_refresh_snapshot();

        if (xQueueReceive(s_bundle_queue, &bundle, pdMS_TO_TICKS(250)) == pdPASS) {
            orelane_dispatch_bundle(&bundle);
        }

        vTaskDelay(pdMS_TO_TICKS(750));
    }
}

void orelane_init(GlobalState *global_state) {
    s_global_state = global_state;
    s_bundle_queue = xQueueCreate(4, sizeof(orelane_bundle_t));
    if (s_bundle_queue == NULL) {
        ESP_LOGE(TAG, "Failed to create ORELANE queue");
        return;
    }

    memset(&s_snapshot, 0, sizeof(s_snapshot));
    strncpy(s_snapshot.last_status, "booting", sizeof(s_snapshot.last_status) - 1);
}

void orelane_start(void) {
    if (s_bundle_queue == NULL) {
        ESP_LOGE(TAG, "ORELANE not initialized");
        return;
    }

    if (xTaskCreate(orelane_task, "orelane", 8192, NULL, 4, NULL) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create ORELANE task");
    }
}

void orelane_set_policy(const orelane_policy_t *policy) {
    if (policy == NULL) {
        return;
    }
    s_policy = *policy;
}

const orelane_snapshot_t *orelane_snapshot(void) {
    return &s_snapshot;
}

bool orelane_submit_signed_bundle(const char *payload, size_t payload_len) {
    orelane_bundle_t bundle;

    if (s_bundle_queue == NULL || payload == NULL || payload_len == 0 || payload_len >= sizeof(bundle.payload)) {
        return false;
    }

    memset(&bundle, 0, sizeof(bundle));
    memcpy(bundle.payload, payload, payload_len);
    bundle.payload_len = payload_len;

    return xQueueSend(s_bundle_queue, &bundle, 0) == pdPASS;
}

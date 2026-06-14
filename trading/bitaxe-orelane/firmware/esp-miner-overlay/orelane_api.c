#include "orelane_api.h"

#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "http_server.h"
#include "orelane.h"
#include "orelane_led.h"

static const char *TAG = "orelane_api";
static int orelane_status_prebuffer_len = 256;
static int orelane_led_prebuffer_len = 256;

static const char *orelane_led_mode_name(orelane_led_mode_t mode) {
    switch (mode) {
        case ORELANE_LED_MODE_OFF:
            return "off";
        case ORELANE_LED_MODE_SOLID:
            return "solid";
        case ORELANE_LED_MODE_CYCLE:
            return "cycle";
        default:
            return "unknown";
    }
}

static esp_err_t orelane_status_get(httpd_req_t *req) {
    if (is_network_allowed(req) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "Unauthorized");
    }

    const orelane_snapshot_t *snapshot = orelane_snapshot();
    cJSON *root = cJSON_CreateObject();

    if (root == NULL) {
        return ESP_FAIL;
    }

    cJSON_AddBoolToObject(root, "healthy", snapshot->healthy);
    cJSON_AddBoolToObject(root, "miningPaused", snapshot->mining_paused);
    cJSON_AddNumberToObject(root, "chipTempC", snapshot->chip_temp_c);
    cJSON_AddNumberToObject(root, "vrTempC", snapshot->vr_temp_c);
    cJSON_AddNumberToObject(root, "cpuPercent", snapshot->cpu_percent);
    cJSON_AddNumberToObject(root, "wifiRssi", snapshot->wifi_rssi);
    cJSON_AddNumberToObject(root, "freeHeap", snapshot->free_heap);
    cJSON_AddNumberToObject(root, "hashrate1m", snapshot->hashrate_1m);
    cJSON_AddNumberToObject(root, "powerWatts", snapshot->power_watts);
    cJSON_AddNumberToObject(root, "lastBundleAtMs", (double)snapshot->last_bundle_at_ms);
    cJSON_AddStringToObject(root, "status", snapshot->last_status);

    httpd_resp_set_type(req, "application/json");
    esp_err_t res = HTTP_send_json(req, root, &orelane_status_prebuffer_len);

    cJSON_Delete(root);
    return res;
}

static esp_err_t orelane_bundle_post(httpd_req_t *req) {
    if (is_network_allowed(req) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "Unauthorized");
    }

    char payload[1024];
    int received = httpd_req_recv(req, payload, sizeof(payload) - 1);
    if (received <= 0) {
        return ESP_FAIL;
    }

    payload[received] = '\0';

    if (!orelane_submit_signed_bundle(payload, (size_t)received)) {
        ESP_LOGW(TAG, "Failed to queue ORE bundle");
        httpd_resp_set_status(req, "503 Service Unavailable");
        httpd_resp_sendstr(req, "{\"message\":\"queue full or invalid payload\"}");
        return ESP_OK;
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, "{\"message\":\"bundle queued\"}");
    return ESP_OK;
}

static esp_err_t orelane_led_get(httpd_req_t *req) {
    if (is_network_allowed(req) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "Unauthorized");
    }

    const orelane_led_state_t *state = orelane_led_state();
    cJSON *root = cJSON_CreateObject();

    if (root == NULL) {
        return ESP_FAIL;
    }

    cJSON_AddBoolToObject(root, "enabled", state->enabled);
    cJSON_AddStringToObject(root, "mode", orelane_led_mode_name(state->mode));
    cJSON_AddNumberToObject(root, "red", state->red);
    cJSON_AddNumberToObject(root, "green", state->green);
    cJSON_AddNumberToObject(root, "blue", state->blue);
    cJSON_AddNumberToObject(root, "brightnessPercent", state->brightness_percent);

    httpd_resp_set_type(req, "application/json");
    esp_err_t res = HTTP_send_json(req, root, &orelane_led_prebuffer_len);

    cJSON_Delete(root);
    return res;
}

static uint8_t orelane_json_uint8(cJSON *root, const char *key, uint8_t default_value) {
    cJSON *item = cJSON_GetObjectItem(root, key);
    if (!cJSON_IsNumber(item)) {
        return default_value;
    }
    if (item->valuedouble < 0) {
        return 0;
    }
    if (item->valuedouble > 255) {
        return 255;
    }
    return (uint8_t)item->valuedouble;
}

static esp_err_t orelane_led_patch(httpd_req_t *req) {
    if (is_network_allowed(req) != ESP_OK) {
        return httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "Unauthorized");
    }

    char payload[256];
    int received = httpd_req_recv(req, payload, sizeof(payload) - 1);
    if (received <= 0) {
        return ESP_FAIL;
    }
    payload[received] = '\0';

    cJSON *root = cJSON_Parse(payload);
    if (root == NULL) {
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid JSON");
    }

    cJSON *mode_json = cJSON_GetObjectItem(root, "mode");
    if (!cJSON_IsString(mode_json)) {
        cJSON_Delete(root);
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Missing mode");
    }

    uint8_t brightness = orelane_json_uint8(root, "brightnessPercent", orelane_led_state()->brightness_percent);

    if (strcmp(mode_json->valuestring, "off") == 0) {
        orelane_led_set_off();
    } else if (strcmp(mode_json->valuestring, "cycle") == 0) {
        orelane_led_set_cycle(brightness);
    } else if (strcmp(mode_json->valuestring, "solid") == 0) {
        uint8_t red = orelane_json_uint8(root, "red", orelane_led_state()->red);
        uint8_t green = orelane_json_uint8(root, "green", orelane_led_state()->green);
        uint8_t blue = orelane_json_uint8(root, "blue", orelane_led_state()->blue);
        orelane_led_set_solid(red, green, blue, brightness);
    } else {
        cJSON_Delete(root);
        return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Unknown mode");
    }

    cJSON_Delete(root);
    return orelane_led_get(req);
}

void orelane_register_http_routes(httpd_handle_t server) {
    httpd_uri_t status_uri = {
        .uri = "/api/orelane/status",
        .method = HTTP_GET,
        .handler = orelane_status_get,
        .user_ctx = NULL,
    };

    httpd_uri_t bundle_uri = {
        .uri = "/api/orelane/bundle",
        .method = HTTP_POST,
        .handler = orelane_bundle_post,
        .user_ctx = NULL,
    };

    httpd_uri_t led_get_uri = {
        .uri = "/api/orelane/led",
        .method = HTTP_GET,
        .handler = orelane_led_get,
        .user_ctx = NULL,
    };

    httpd_uri_t led_patch_uri = {
        .uri = "/api/orelane/led",
        .method = HTTP_PATCH,
        .handler = orelane_led_patch,
        .user_ctx = NULL,
    };

    httpd_register_uri_handler(server, &status_uri);
    httpd_register_uri_handler(server, &bundle_uri);
    httpd_register_uri_handler(server, &led_get_uri);
    httpd_register_uri_handler(server, &led_patch_uri);
}

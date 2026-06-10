#include "orelane_api.h"

#include <string.h>

#include "cJSON.h"
#include "esp_log.h"
#include "http_server.h"
#include "orelane.h"

static const char *TAG = "orelane_api";
static int orelane_status_prebuffer_len = 256;

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

    httpd_register_uri_handler(server, &status_uri);
    httpd_register_uri_handler(server, &bundle_uri);
}

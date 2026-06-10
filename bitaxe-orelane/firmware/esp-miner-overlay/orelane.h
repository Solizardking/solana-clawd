#ifndef ORELANE_H_
#define ORELANE_H_

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "global_state.h"

typedef enum {
    ORELANE_MODE_DISABLED = 0,
    ORELANE_MODE_PAPER = 1,
    ORELANE_MODE_SIGNED_BUNDLE = 2,
} orelane_mode_t;

typedef struct {
    orelane_mode_t mode;
    uint32_t max_temp_c;
    uint32_t max_cpu_percent;
    int32_t min_wifi_rssi;
    uint32_t min_free_heap;
} orelane_policy_t;

typedef struct {
    bool healthy;
    bool mining_paused;
    float chip_temp_c;
    float vr_temp_c;
    float cpu_percent;
    int32_t wifi_rssi;
    uint32_t free_heap;
    float hashrate_1m;
    float power_watts;
    uint64_t last_bundle_at_ms;
    char last_status[64];
} orelane_snapshot_t;

void orelane_init(GlobalState *global_state);
void orelane_start(void);
void orelane_set_policy(const orelane_policy_t *policy);
const orelane_snapshot_t *orelane_snapshot(void);
bool orelane_submit_signed_bundle(const char *payload, size_t payload_len);

#endif


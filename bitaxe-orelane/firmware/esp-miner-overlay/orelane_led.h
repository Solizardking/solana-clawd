#ifndef ORELANE_LED_H_
#define ORELANE_LED_H_

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    ORELANE_LED_MODE_OFF = 0,
    ORELANE_LED_MODE_SOLID = 1,
    ORELANE_LED_MODE_CYCLE = 2,
} orelane_led_mode_t;

typedef struct {
    bool enabled;
    orelane_led_mode_t mode;
    uint8_t red;
    uint8_t green;
    uint8_t blue;
    uint8_t brightness_percent;
} orelane_led_state_t;

void orelane_led_start(void);
void orelane_led_set_off(void);
void orelane_led_set_solid(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent);
void orelane_led_set_cycle(uint8_t brightness_percent);
const orelane_led_state_t *orelane_led_state(void);

#endif /* ORELANE_LED_H_ */

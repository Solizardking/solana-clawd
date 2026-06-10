#include "orelane_led.h"

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#if CONFIG_ORELANE_LED_ENABLED
#include "led_strip.h"
#endif

static const char *TAG = "orelane_led";

static orelane_led_state_t s_state = {
#if CONFIG_ORELANE_LED_ENABLED
    .enabled = true,
    .mode = ORELANE_LED_MODE_CYCLE,
    .red = 255,
    .green = 0,
    .blue = 64,
    .brightness_percent = CONFIG_ORELANE_LED_BRIGHTNESS_PERCENT,
#else
    .enabled = false,
    .mode = ORELANE_LED_MODE_OFF,
    .red = 0,
    .green = 0,
    .blue = 0,
    .brightness_percent = 0,
#endif
};

static uint8_t orelane_led_clamp_brightness(uint8_t brightness_percent) {
#if CONFIG_ORELANE_LED_ENABLED
    if (brightness_percent == 0) {
        return CONFIG_ORELANE_LED_BRIGHTNESS_PERCENT;
    }
    if (brightness_percent > 100) {
        return 100;
    }
    return brightness_percent;
#else
    (void)brightness_percent;
    return 0;
#endif
}

#if CONFIG_ORELANE_LED_ENABLED
static led_strip_handle_t s_strip = NULL;

typedef struct {
    uint8_t red;
    uint8_t green;
    uint8_t blue;
} orelane_led_rgb_t;

static const orelane_led_rgb_t ORELANE_LED_PALETTE[] = {
    {255, 0, 64},
    {255, 96, 0},
    {255, 224, 0},
    {0, 220, 96},
    {0, 160, 255},
    {96, 64, 255},
};

static uint8_t scale_channel(uint8_t channel, uint8_t brightness_percent) {
    return (uint8_t)(((uint16_t)channel * brightness_percent) / 100);
}

static void orelane_led_write(uint8_t red, uint8_t green, uint8_t blue) {
    if (s_strip == NULL) {
        return;
    }

    uint8_t brightness = orelane_led_clamp_brightness(s_state.brightness_percent);
    uint8_t scaled_red = scale_channel(red, brightness);
    uint8_t scaled_green = scale_channel(green, brightness);
    uint8_t scaled_blue = scale_channel(blue, brightness);

    for (uint16_t i = 0; i < CONFIG_ORELANE_LED_COUNT; i++) {
        ESP_ERROR_CHECK_WITHOUT_ABORT(led_strip_set_pixel(s_strip, i, scaled_red, scaled_green, scaled_blue));
    }
    ESP_ERROR_CHECK_WITHOUT_ABORT(led_strip_refresh(s_strip));
}

static void orelane_led_clear(void) {
    if (s_strip == NULL) {
        return;
    }
    ESP_ERROR_CHECK_WITHOUT_ABORT(led_strip_clear(s_strip));
}

static void orelane_led_task(void *pvParameters) {
    (void)pvParameters;
    size_t palette_index = 0;

    while (1) {
        switch (s_state.mode) {
            case ORELANE_LED_MODE_OFF:
                orelane_led_clear();
                vTaskDelay(pdMS_TO_TICKS(500));
                break;
            case ORELANE_LED_MODE_SOLID:
                orelane_led_write(s_state.red, s_state.green, s_state.blue);
                vTaskDelay(pdMS_TO_TICKS(1000));
                break;
            case ORELANE_LED_MODE_CYCLE: {
                const orelane_led_rgb_t color = ORELANE_LED_PALETTE[palette_index];
                s_state.red = color.red;
                s_state.green = color.green;
                s_state.blue = color.blue;
                orelane_led_write(color.red, color.green, color.blue);
                palette_index = (palette_index + 1) % (sizeof(ORELANE_LED_PALETTE) / sizeof(ORELANE_LED_PALETTE[0]));
                vTaskDelay(pdMS_TO_TICKS(CONFIG_ORELANE_LED_CYCLE_MS));
                break;
            }
            default:
                s_state.mode = ORELANE_LED_MODE_OFF;
                break;
        }
    }
}
#endif

void orelane_led_start(void) {
#if CONFIG_ORELANE_LED_ENABLED
    if (s_strip != NULL) {
        return;
    }

    led_strip_config_t strip_config = {
        .strip_gpio_num = CONFIG_ORELANE_LED_GPIO,
        .max_leds = CONFIG_ORELANE_LED_COUNT,
        .led_model = LED_MODEL_WS2812,
        .color_component_format = LED_STRIP_COLOR_COMPONENT_FMT_GRB,
        .flags = {
            .invert_out = false,
        },
    };
    led_strip_rmt_config_t rmt_config = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10 * 1000 * 1000,
        .mem_block_symbols = 64,
        .flags = {
            .with_dma = false,
        },
    };

    esp_err_t err = led_strip_new_rmt_device(&strip_config, &rmt_config, &s_strip);
    if (err != ESP_OK) {
        s_state.enabled = false;
        ESP_LOGE(TAG, "Failed to initialize base LED strip on GPIO %d: %s", CONFIG_ORELANE_LED_GPIO, esp_err_to_name(err));
        return;
    }

    ESP_LOGI(TAG, "Base LED color cycle enabled on GPIO %d with %d LEDs", CONFIG_ORELANE_LED_GPIO, CONFIG_ORELANE_LED_COUNT);
    if (xTaskCreate(orelane_led_task, "orelane_led", 4096, NULL, 2, NULL) != pdPASS) {
        s_state.enabled = false;
        ESP_LOGE(TAG, "Failed to create LED task");
    }
#else
    ESP_LOGI(TAG, "Base LED support disabled");
#endif
}

void orelane_led_set_off(void) {
    s_state.mode = ORELANE_LED_MODE_OFF;
    s_state.red = 0;
    s_state.green = 0;
    s_state.blue = 0;
}

void orelane_led_set_solid(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent) {
    s_state.mode = ORELANE_LED_MODE_SOLID;
    s_state.red = red;
    s_state.green = green;
    s_state.blue = blue;
    s_state.brightness_percent = orelane_led_clamp_brightness(brightness_percent);
}

void orelane_led_set_cycle(uint8_t brightness_percent) {
    s_state.mode = ORELANE_LED_MODE_CYCLE;
    s_state.brightness_percent = orelane_led_clamp_brightness(brightness_percent);
}

const orelane_led_state_t *orelane_led_state(void) {
    return &s_state;
}

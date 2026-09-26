#include <Wire.h>
#include "rgb_lcd.h"

// ==========================================
// GUS v2.4 - DIVHACKS 2026
// Arduino/Genuino 101 + Grove Shield
// ==========================================

// PINS
const int PIN_SOIL1 = A0;
const int PIN_SOIL2 = A1;
const int PIN_AIR = A2;
const int PIN_POWER = 8;
const int PIN_PET = 6;
const int PIN_BUZZER = 4;

rgb_lcd lcd;

// CALIBRATION - YOUR MEASURED VALUES
const bool SOIL_CALIBRATED = true;

const int SOIL1_DRY = 279;
const int SOIL1_WET = 958;
const int SOIL2_DRY = 290;
const int SOIL2_WET = 925;

// THRESHOLDS
const int CRITICAL_LIMIT = 15;
const int THIRSTY_LIMIT = 30;
const int HEALTHY_LIMIT = 60;
const int UNEVEN_THRESHOLD = 25;
const int WATERING_DELTA = 10;

// TIMING
const unsigned long SENSOR_MS = 1000;
const unsigned long LCD_MS = 150;
const unsigned long SERIAL_MS = 2000;
const unsigned long DEBOUNCE_MS = 80;
const unsigned long PET_HOLD_MS = 3000;
const unsigned long PET_DURATION = 4500;
const unsigned long WATER_DURATION = 8000;
const unsigned long AIR_WARMUP_MS = 120000;
const unsigned long WATER_COOLDOWN = 30000;
const unsigned long ALERT_COOLDOWN = 300000;

const unsigned long BLINK_DURATION = 150;
const unsigned long DOUBLE_BLINK_GAP = 160;
const unsigned long THOUGHT_DURATION = 2300;

// TREE HEALTH
enum Health {
  UNKNOWN,
  HEALTHY,
  OKAY,
  THIRSTY,
  CRITICAL,
  UNEVEN
};

Health health = UNKNOWN;
Health pendingHealth = UNKNOWN;
int healthConfirmations = 0;

// SENSOR VALUES
int soil1Raw = 0;
int soil2Raw = 0;
int airRaw = 0;

int soil1Pct = 0;
int soil2Pct = 0;
int moistureAverage = 0;
int moistureDifference = 0;
bool unevenMoisture = false;

int airBaseline = 0;
long airTotal = 0;
int airSamples = 0;
bool airReady = false;

// DEVICE STATE
bool gusOn = true;
bool recentlyPetted = false;
bool recentlyWatered = false;

unsigned long petUntil = 0;
unsigned long wateredUntil = 0;
unsigned long lastWatering = 0;
unsigned long lastAlert = 0;

bool hasWatered = false;
bool hasAlerted = false;

int currentScreen = 0;
const int TOTAL_SCREENS = 6;

// TOUCH STATE
bool powerStable = false;
bool petStable = false;
bool powerLastRaw = false;
bool petLastRaw = false;

unsigned long powerChangedAt = 0;
unsigned long petChangedAt = 0;
unsigned long petStartedAt = 0;

bool petHoldHandled = false;

// FACE ANIMATION
// 0 = open
// 1 = closed
// 2 = open between double blink
// 3 = second closed blink

int blinkStage = 0;
unsigned long blinkStageAt = 0;
unsigned long nextBlinkAt = 0;
bool doubleBlink = false;

bool showingThought = false;
unsigned long thoughtStartedAt = 0;
unsigned long nextThoughtAt = 0;
String currentThought = "";

bool bootExpression = true;
unsigned long bootStartedAt = 0;

// WATERING DETECTION
int moistureReference = -1;
int wateringConfirmations = 0;

// TIMERS AND TIMESTAMPS
unsigned long lastSensor = 0;
unsigned long lastLCD = 0;
unsigned long lastSerial = 0;

unsigned long sampleTimestampMs = 0;
unsigned long telemetrySequence = 0;
unsigned long eventSequence = 0;

// BUZZER
bool secondNotePending = false;
unsigned long secondNoteAt = 0;

// ==========================================
// LCD
// ==========================================

void printLine(int row, String message) {
  if (message.length() > 16) {
    message = message.substring(0, 16);
  }

  while (message.length() < 16) {
    message += " ";
  }

  lcd.setCursor(0, row);
  lcd.print(message);
}

// ==========================================
// TIMESTAMPED EVENT LOGGING
// ==========================================

String healthName(Health state);

// Arduino provides uptime timestamps.
// Mac logger adds the real UTC timestamp.

void logEvent(const char *event) {
  Serial.print(
    "{\"record_type\":\"event\","
    "\"device_id\":\"gus-001\","
    "\"event\":\""
  );

  Serial.print(event);

  Serial.print("\",\"event_sequence\":");
  Serial.print(++eventSequence);

  Serial.print(",\"uptime_ms\":");
  Serial.print(millis());

  Serial.println("}");
}

void logHealthEvent() {
  Serial.print(
    "{\"record_type\":\"event\","
    "\"device_id\":\"gus-001\","
    "\"event\":\"health_changed\","
    "\"health\":\""
  );

  Serial.print(healthName(health));

  Serial.print("\",\"event_sequence\":");
  Serial.print(++eventSequence);

  Serial.print(",\"uptime_ms\":");
  Serial.print(millis());

  Serial.println("}");
}

void logScreenEvent() {
  Serial.print(
    "{\"record_type\":\"event\","
    "\"device_id\":\"gus-001\","
    "\"event\":\"screen_changed\","
    "\"screen\":"
  );

  Serial.print(currentScreen);

  Serial.print(",\"event_sequence\":");
  Serial.print(++eventSequence);

  Serial.print(",\"uptime_ms\":");
  Serial.print(millis());

  Serial.println("}");
}

// ==========================================
// GENTLE SOUNDS
// ==========================================

void playSound(int frequency, int duration) {
  if (!gusOn) return;
  tone(PIN_BUZZER, frequency, duration);
}

void soundPet() {
  playSound(700, 40);
}

void soundWake() {
  playSound(650, 55);
}

void soundThirsty() {
  playSound(420, 70);
}

void soundCritical() {
  playSound(350, 90);
}

void soundHealthy() {
  playSound(800, 50);
}

void soundWatered() {
  if (!gusOn) return;

  playSound(650, 65);

  secondNotePending = true;
  secondNoteAt = millis() + 130;
}

void updateSound() {
  if (secondNotePending &&
      (long)(millis() - secondNoteAt) >= 0) {

    secondNotePending = false;
    playSound(850, 75);
  }
}

void silenceGus() {
  noTone(PIN_BUZZER);
  secondNotePending = false;
}

// ==========================================
// SENSOR HELPERS
// ==========================================

int readAverageADC(int pin) {
  long total = 0;

  for (int i = 0; i < 5; i++) {
    total += analogRead(pin);
    delay(2);
  }

  return total / 5;
}

int moisturePercent(int raw, int dry, int wet) {
  if (dry == wet) return 0;

  long value = map(raw, dry, wet, 0, 100);
  return constrain(value, 0, 100);
}

// ==========================================
// AIR QUALITY
// ==========================================

// Relative gas response only.
// Not official AQI, CO2 or PM2.5.

String airStatus() {
  if (!airReady) return "warming_up";

  int change = airRaw - airBaseline;

  if (change > 150) return "elevated";
  if (change > 50) return "above_baseline";
  if (change < -50) return "below_baseline";

  return "near_baseline";
}

String airShortStatus() {
  if (!airReady) return "WARMING";

  int change = airRaw - airBaseline;

  if (change > 150) return "ELEVATED";
  if (change > 50) return "ABOVE BASE";

  return "NEAR BASE";
}

// ==========================================
// TREE HEALTH
// ==========================================

Health classifyHealth() {
  if (!SOIL_CALIBRATED) return UNKNOWN;
  if (unevenMoisture) return UNEVEN;

  if (moistureAverage < CRITICAL_LIMIT) {
    return CRITICAL;
  }

  if (moistureAverage < THIRSTY_LIMIT) {
    return THIRSTY;
  }

  if (moistureAverage >= HEALTHY_LIMIT) {
    return HEALTHY;
  }

  return OKAY;
}

String healthName(Health state) {
  switch (state) {
    case HEALTHY: return "healthy";
    case OKAY: return "okay";
    case THIRSTY: return "thirsty";
    case CRITICAL: return "very_thirsty";
    case UNEVEN: return "uneven_moisture";
    default: return "uncalibrated";
  }
}

String gusMood() {
  if (!gusOn) return "sleeping";
  if (recentlyWatered) return "grateful";
  if (recentlyPetted) return "loved";

  switch (health) {
    case HEALTHY: return "happy";
    case OKAY: return "chilling";
    case THIRSTY: return "thirsty";
    case CRITICAL: return "desperate";
    case UNEVEN: return "confused";
    default: return "curious";
  }
}

void updateHealth() {
  Health next = classifyHealth();

  if (next == health) {
    pendingHealth = next;
    healthConfirmations = 0;
    return;
  }

  if (next != pendingHealth) {
    pendingHealth = next;
    healthConfirmations = 1;
    return;
  }

  healthConfirmations++;

  if (healthConfirmations < 3) return;

  Health oldHealth = health;
  health = next;
  healthConfirmations = 0;

  logHealthEvent();

  // No alarm immediately during startup.
  if (oldHealth == UNKNOWN) return;
  if (!gusOn || recentlyWatered) return;

  unsigned long now = millis();

  if (hasAlerted &&
      now - lastAlert < ALERT_COOLDOWN) {
    return;
  }

  if (health == THIRSTY) {
    soundThirsty();
  }
  else if (health == CRITICAL) {
    soundCritical();
  }
  else if (health == HEALTHY) {
    soundHealthy();
  }
  else {
    return;
  }

  lastAlert = now;
  hasAlerted = true;
}

// ==========================================
// WATERING DETECTION
// ==========================================

void updateWatering() {
  if (!SOIL_CALIBRATED) return;

  unsigned long now = millis();

  if (moistureReference < 0) {
    moistureReference = moistureAverage;
    return;
  }

  if (hasWatered &&
      now - lastWatering < WATER_COOLDOWN) {
    wateringConfirmations = 0;
    return;
  }

  int increase =
    moistureAverage - moistureReference;

  if (increase >= WATERING_DELTA) {
    wateringConfirmations++;

    if (wateringConfirmations >= 2) {
      recentlyWatered = true;
      wateredUntil = now + WATER_DURATION;

      lastWatering = now;
      hasWatered = true;

      moistureReference = moistureAverage;
      wateringConfirmations = 0;

      currentScreen = 0;
      soundWatered();

      logEvent("watering_detected");
    }
  }
  else {
    wateringConfirmations = 0;

    if (moistureAverage < moistureReference) {
      moistureReference = moistureAverage;
    }
  }
}

// ==========================================
// SENSOR READING
// ==========================================

void readSensors() {
  unsigned long now = millis();

  // Timestamp this actual sensor sample.
  sampleTimestampMs = now;

  soil1Raw = readAverageADC(PIN_SOIL1);
  soil2Raw = readAverageADC(PIN_SOIL2);
  airRaw = readAverageADC(PIN_AIR);

  if (SOIL_CALIBRATED) {
    soil1Pct = moisturePercent(
      soil1Raw, SOIL1_DRY, SOIL1_WET
    );

    soil2Pct = moisturePercent(
      soil2Raw, SOIL2_DRY, SOIL2_WET
    );

    moistureAverage =
      (soil1Pct + soil2Pct) / 2;

    moistureDifference =
      abs(soil1Pct - soil2Pct);

    unevenMoisture =
      moistureDifference > UNEVEN_THRESHOLD;
  }

  // Air sensor warmup and baseline.
  if (now >= AIR_WARMUP_MS && !airReady) {
    airTotal += airRaw;
    airSamples++;

    if (airSamples >= 10) {
      airBaseline = airTotal / airSamples;
      airReady = true;

      logEvent("air_sensor_ready");
    }
  }

  updateWatering();
  updateHealth();

  if (recentlyWatered &&
      (long)(now - wateredUntil) >= 0) {
    recentlyWatered = false;
  }

  if (recentlyPetted &&
      (long)(now - petUntil) >= 0) {
    recentlyPetted = false;
  }
}

// ==========================================
// SOFT POWER
// ==========================================

void resetFaceAnimation() {
  unsigned long now = millis();

  blinkStage = 0;
  nextBlinkAt = now + random(3000, 6000);

  showingThought = false;
  nextThoughtAt = now + random(8000, 15000);

  bootExpression = true;
  bootStartedAt = now;
}

void turnGusOff() {
  gusOn = false;
  silenceGus();
  lcd.noDisplay();

  logEvent("device_off");
}

void turnGusOn() {
  gusOn = true;
  currentScreen = 0;

  lcd.display();
  resetFaceAnimation();
  soundWake();

  logEvent("device_on");
}

void petGus() {
  if (!gusOn) return;

  recentlyPetted = true;
  petUntil = millis() + PET_DURATION;

  currentScreen = 0;
  showingThought = false;

  soundPet();
  logEvent("gus_petted");
}

// ==========================================
// TOUCH CONTROLS
// ==========================================

void handleTouch() {
  unsigned long now = millis();

  bool powerRaw =
    digitalRead(PIN_POWER) == HIGH;

  bool petRaw =
    digitalRead(PIN_PET) == HIGH;

  // D8 - Power

  if (powerRaw != powerLastRaw) {
    powerChangedAt = now;
    powerLastRaw = powerRaw;
  }

  if (now - powerChangedAt >= DEBOUNCE_MS &&
      powerRaw != powerStable) {

    powerStable = powerRaw;

    if (powerStable) {
      if (gusOn) turnGusOff();
      else turnGusOn();
    }
  }

  // D6 - Screen / Pet

  if (petRaw != petLastRaw) {
    petChangedAt = now;
    petLastRaw = petRaw;
  }

  if (now - petChangedAt >= DEBOUNCE_MS &&
      petRaw != petStable) {

    petStable = petRaw;

    if (petStable) {
      petStartedAt = now;
      petHoldHandled = false;
    }
    else if (!petHoldHandled && gusOn) {
      currentScreen =
        (currentScreen + 1) % TOTAL_SCREENS;

      logScreenEvent();
    }
  }

  // Hold 3 seconds to pet Gus.
  if (petStable &&
      !petHoldHandled &&
      gusOn &&
      now - petStartedAt >= PET_HOLD_MS) {

    petHoldHandled = true;
    petGus();
  }
}

// ==========================================
// FACE ANIMATION ENGINE
// ==========================================

void updateFaceAnimation() {
  unsigned long now = millis();

  if (!gusOn) return;

  if (bootExpression &&
      now - bootStartedAt >= 1300) {
    bootExpression = false;
  }

  if (recentlyWatered || recentlyPetted) {
    return;
  }

  // BLINKING
  if (blinkStage == 0 &&
      (long)(now - nextBlinkAt) >= 0) {

    blinkStage = 1;
    blinkStageAt = now;

    // Occasionally double blink.
    doubleBlink = random(0, 4) == 0;
  }

  else if (blinkStage == 1 &&
           now - blinkStageAt >= BLINK_DURATION) {

    if (doubleBlink) {
      blinkStage = 2;
      blinkStageAt = now;
    }
    else {
      blinkStage = 0;
      nextBlinkAt =
        now + random(3000, 6500);
    }
  }

  else if (blinkStage == 2 &&
           now - blinkStageAt >= DOUBLE_BLINK_GAP) {

    blinkStage = 3;
    blinkStageAt = now;
  }

  else if (blinkStage == 3 &&
           now - blinkStageAt >= BLINK_DURATION) {

    blinkStage = 0;
    nextBlinkAt =
      now + random(3000, 6500);
  }

  // OCCASIONAL RANDOM THOUGHTS
  if (!bootExpression &&
      !showingThought &&
      (long)(now - nextThoughtAt) >= 0) {

    showingThought = true;
    thoughtStartedAt = now;

    int choice = random(0, 4);

    switch (health) {
      case HEALTHY:
        if (choice == 0) currentThought = "nice day out :)";
        if (choice == 1) currentThought = "feelin fresh";
        if (choice == 2) currentThought = "i love this block";
        if (choice == 3) currentThought = "we vibin";
        break;

      case OKAY:
        if (choice == 0) currentThought = "just chillin";
        if (choice == 1) currentThought = "hey neighbor :)";
        if (choice == 2) currentThought = "wyd today";
        if (choice == 3) currentThought = "another NYC day";
        break;

      case THIRSTY:
        if (choice == 0) currentThought = "water pls ;-;";
        if (choice == 1) currentThought = "kinda parched";
        if (choice == 2) currentThought = "anyone got water";
        if (choice == 3) currentThought = "it's dry out";
        break;

      case CRITICAL:
        if (choice == 0) currentThought = "im so thirsty";
        if (choice == 1) currentThought = "send water pls";
        if (choice == 2) currentThought = "guys help ;-;";
        if (choice == 3) currentThought = "not feelin great";
        break;

      case UNEVEN:
        if (choice == 0) currentThought = "one side is dry";
        if (choice == 1) currentThought = "water evenly pls";
        if (choice == 2) currentThought = "bit uneven rn";
        if (choice == 3) currentThought = "check my soil";
        break;

      default:
        currentThought = "hello new york!";
        break;
    }
  }

  if (showingThought &&
      now - thoughtStartedAt >= THOUGHT_DURATION) {

    showingThought = false;

    nextThoughtAt =
      now + random(8000, 15000);
  }
}

// ==========================================
// DEFAULT FACE
// ==========================================

void displayFace() {

  if (recentlyWatered) {
    printLine(0, "     (^o^)");
    printLine(1, "thank u human!!");
    return;
  }

  if (recentlyPetted) {
    printLine(0, "     (^w^)");

    if (health == THIRSTY ||
        health == CRITICAL) {
      printLine(1, "love u. water?");
    }
    else {
      printLine(1, "hehe thank you");
    }

    return;
  }

  // Startup face.
  if (bootExpression) {
    printLine(0, "     ( -_-)");
    printLine(1, "");
    return;
  }

  // Closed blink frames.
  if (blinkStage == 1 ||
      blinkStage == 3) {

    printLine(0, "     ( -_-)");
    printLine(1, "");
    return;
  }

  // Main face changes with health.
  String face;

  switch (health) {
    case HEALTHY:
      face = "     (^_^)";
      break;

    case OKAY:
      face = "     (o_o)";
      break;

    case THIRSTY:
      face = "     (T_T)";
      break;

    case CRITICAL:
      face = "     (x_x)";
      break;

    case UNEVEN:
      face = "     (o_O)";
      break;

    default:
      face = "     (o_o)";
      break;
  }

  printLine(0, face);

  // No permanent text on the home screen.
  if (showingThought) {
    printLine(1, currentThought);
  }
  else {
    printLine(1, "");
  }
}

// ==========================================
// SIX LCD SCREENS
// ==========================================

void updateDisplay() {
  if (!gusOn) return;

  switch (currentScreen) {

    // 0 - Animated face
    case 0:
      displayFace();
      break;

    // 1 - Tree health
    case 1:
      printLine(0, "TREE HEALTH:");

      if (health == CRITICAL)
        printLine(1, "VERY THIRSTY!");

      else if (health == THIRSTY)
        printLine(1, "Needs water");

      else if (health == HEALTHY)
        printLine(1, "Well hydrated");

      else if (health == UNEVEN)
        printLine(1, "Uneven watering");

      else if (health == OKAY)
        printLine(1, "Moisture okay");

      else
        printLine(1, "Not calibrated");

      break;

    // 2 - Environmental metrics
    case 2:
      printLine(
        0,
        "SOIL: " +
        String(moistureAverage) + "%"
      );

      printLine(
        1,
        "AIR: " + airShortStatus()
      );

      break;

    // 3 - Individual soil probes
    case 3:
      printLine(
        0,
        "Probe 1: " +
        String(soil1Pct) + "%"
      );

      printLine(
        1,
        "Probe 2: " +
        String(soil2Pct) + "%"
      );

      break;

    // 4 - Air sensor
    case 4:
      printLine(0, "AIR SENSOR:");

      if (!airReady) {
        unsigned long remaining = 0;

        if (millis() < AIR_WARMUP_MS) {
          remaining =
            (AIR_WARMUP_MS - millis()) / 1000;
        }

        printLine(
          1,
          "Warmup " +
          String(remaining) + "s"
        );
      }
      else {
        printLine(
          1,
          "RAW:" + String(airRaw) +
          " B:" + String(airBaseline)
        );
      }

      break;

    // 5 - About
    case 5:
      printLine(0, "GUS - NYC TREE");
      printLine(1, "DivHacks 2026");
      break;
  }
}

// ==========================================
// TIMESTAMPED JSON TELEMETRY
// ==========================================

void sendTelemetry() {

  Serial.print("{\"record_type\":\"telemetry\",");

  Serial.print("\"device_id\":\"gus-001\",");

  // Monotonically increasing record sequence
  Serial.print("\"sequence\":");
  Serial.print(++telemetrySequence);
  Serial.print(",");

  // Actual sensor sampling time
  Serial.print("\"sample_uptime_ms\":");
  Serial.print(sampleTimestampMs);
  Serial.print(",");

  // Time when record is transmitted
  Serial.print("\"uptime_ms\":");
  Serial.print(millis());
  Serial.print(",");

  // RAW SOIL
  Serial.print("\"soil1_raw\":");
  Serial.print(soil1Raw);
  Serial.print(",");

  Serial.print("\"soil2_raw\":");
  Serial.print(soil2Raw);
  Serial.print(",");

  // CALIBRATION
  Serial.print("\"soil_calibrated\":");
  Serial.print(
    SOIL_CALIBRATED ? "true" : "false"
  );
  Serial.print(",");

  // INDIVIDUAL MOISTURE
  Serial.print("\"soil1_percent\":");
  Serial.print(soil1Pct);
  Serial.print(",");

  Serial.print("\"soil2_percent\":");
  Serial.print(soil2Pct);
  Serial.print(",");

  // COMBINED MOISTURE
  Serial.print("\"moisture_avg\":");
  Serial.print(moistureAverage);
  Serial.print(",");

  Serial.print("\"moisture_difference\":");
  Serial.print(moistureDifference);
  Serial.print(",");

  Serial.print("\"uneven_moisture\":");
  Serial.print(
    unevenMoisture ? "true" : "false"
  );
  Serial.print(",");

  // AIR
  Serial.print("\"air_raw\":");
  Serial.print(airRaw);
  Serial.print(",");

  Serial.print("\"air_ready\":");
  Serial.print(
    airReady ? "true" : "false"
  );
  Serial.print(",");

  Serial.print("\"air_baseline\":");

  if (airReady)
    Serial.print(airBaseline);
  else
    Serial.print("null");

  Serial.print(",");

  Serial.print("\"air_status\":\"");
  Serial.print(airStatus());
  Serial.print("\",");

  // No physical temperature or humidity
  // sensor is currently attached.
  Serial.print("\"temperature_c\":null,");
  Serial.print("\"humidity_rh\":null,");

  // GUS STATE
  Serial.print("\"health\":\"");
  Serial.print(healthName(health));
  Serial.print("\",");

  Serial.print("\"mood\":\"");
  Serial.print(gusMood());
  Serial.print("\",");

  Serial.print("\"powered_on\":");
  Serial.print(gusOn ? "true" : "false");
  Serial.print(",");

  Serial.print("\"screen\":");
  Serial.print(currentScreen);

  Serial.println("}");
}

// ==========================================
// SETUP
// ==========================================

void setup() {
  Serial.begin(115200);

  pinMode(PIN_POWER, INPUT);
  pinMode(PIN_PET, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  lcd.begin(16, 2);

  // RGB backlight disabled until fixed.
  randomSeed(analogRead(A3));

  // Face immediately on startup.
  printLine(0, "     (-_-)");
  printLine(1, "");

  resetFaceAnimation();
  readSensors();

  logEvent("gus_booted");
}

// ==========================================
// MAIN LOOP
// ==========================================

void loop() {
  unsigned long now = millis();

  handleTouch();
  updateSound();

  if (gusOn) {
    if (now - lastSensor >= SENSOR_MS) {
      lastSensor = now;
      readSensors();
    }

    updateFaceAnimation();

    if (now - lastLCD >= LCD_MS) {
      lastLCD = now;
      updateDisplay();
    }
  }

  // Keep reporting power state when off.
  if (now - lastSerial >= SERIAL_MS) {
    lastSerial = now;
    sendTelemetry();
  }
}

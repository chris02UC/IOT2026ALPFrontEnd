#include <Ds1302.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>

// WiFi Credentials
#define WIFI_SSID     "WIFI_NAME"
#define WIFI_PASSWORD "WIFI_PASSWORD"

// Firebase Credentials
#define FIREBASE_API_KEY      "AIzaSyC-LhMRAQJq88FhUai68BfAkQ5s2CfDM24"
#define FIREBASE_DATABASE_URL "https://iot-alp-46c09-default-rtdb.asia-southeast1.firebasedatabase.app"

// Pin Definitions
#define PIN_TRIG 14
#define PIN_ECHO 12
#define PIN_LED  27
#define PIN_CLK  26
#define PIN_DAT  25
#define PIN_RST  33

// Thresholds
const float RISE_THRESHOLD = 0.25;  // triggers POTENTIAL_FLOOD (in cm)
const float DROP_MARGIN = 2.0;   // water must drop at least this much to clear flood state (in cm)

// RTC Setup (RST, CLK, DAT)
Ds1302 rtc(PIN_RST, PIN_CLK, PIN_DAT);

// Firebase Setup
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// Timing for sensor interval
unsigned long lastCheckTime = 0;
const unsigned long interval = 2000;
float previousDistance = -1;

// Flood state tracking
bool inFloodState = false;

// so we can compare against it to detect a meaningful drop later.
float floodPeakDistance = -1;

// Non-blocking LED blink state.
bool ledBlinkActive = false;
unsigned long lastBlinkTime = 0;
const unsigned long blinkInterval = 300;
bool ledState = false;

// format Ds1302::DateTime into a readable string
String getTimestamp(const Ds1302::DateTime& dt) {
  char buf[20];
  snprintf(buf, sizeof(buf),
    "20%02d-%02d-%02d %02d:%02d:%02d",
    dt.year, dt.month, dt.day,
    dt.hour, dt.minute, dt.second
  );
  return String(buf);
}

// Helper: push a log entry to Firebase
void pushLog(const String& timestamp, float distance, float riseSpeed, const String& status) {
  if (!Firebase.ready()) {
    Serial.println("Firebase: not ready, skipping push");
    return;
  }

  FirebaseJson json;
  json.set("timestamp", timestamp);
  json.set("water_to_sensor_distance_cm", distance);
  json.set("rise_speed_cm_s", riseSpeed);
  json.set("status", status);  // "POTENTIAL_FLOOD" or "SAFE"

  String path = (status == "POTENTIAL_FLOOD") ? "/alerts" : "/safe_logs";

  if (Firebase.RTDB.pushJSON(&fbdo, path.c_str(), &json)) {
    Serial.println("Firebase: [" + status + "] saved — " + timestamp);
  } else {
    Serial.println("Firebase error: " + fbdo.errorReason());
  }
}

void setup() {
  Serial.begin(115200);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_LED, OUTPUT);
  digitalWrite(PIN_LED, LOW);

  rtc.init();

  if (rtc.isHalted()) {
    Serial.println("RTC: was halted, restarting...");
    Ds1302::DateTime dt;
    dt.year = 25;
    dt.month = 6;
    dt.day = 8;
    dt.hour = 0;
    dt.minute = 0;
    dt.second = 0;
    dt.dow = 1;
    rtc.setDateTime(&dt);
  }

  Serial.println("RTC ready.");

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected: " + WiFi.localIP().toString());

  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;

  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase sign-up successful");
  } else {
    Serial.printf("Firebase sign-up failed: %s\n", config.signer.signupError.message.c_str());
  }

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  // 1. Read current distance
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH);
  float currentDistance = duration / 58.0;

  unsigned long currentTime = millis();

  // 2. Run calculations every 2 seconds
  if (currentTime - lastCheckTime >= interval) {

    if (previousDistance < 0) {
      previousDistance = currentDistance;
    }

    float deltaH = previousDistance - currentDistance;
    float timeInSecs = interval / 1000.0;
    float riseSpeed  = deltaH / timeInSecs;
    if (riseSpeed < 0) riseSpeed = 0;

    Ds1302::DateTime now;
    rtc.getDateTime(&now);
    String timestamp = getTimestamp(now);

    if (!inFloodState) {
      // SAFE: check if water is rising fast enough to trigger alert
      if (riseSpeed >= RISE_THRESHOLD) {
        inFloodState = true;
        ledBlinkActive = true;
        floodPeakDistance = currentDistance; // record distance when flood was triggered
        pushLog(timestamp, currentDistance, riseSpeed, "POTENTIAL_FLOOD");
      }
    } else {
      // FLOOD: check if water level has dropped enough from when alert triggered
      // currentDistance > floodPeakDistance means sensor is farther from water = water went down
      if (currentDistance >= floodPeakDistance + DROP_MARGIN) {
        inFloodState = false;
        ledBlinkActive = false;
        floodPeakDistance = -1;
        digitalWrite(PIN_LED, LOW);
        ledState = false;
        pushLog(timestamp, currentDistance, 0.0, "SAFE");
      } else if (floodPeakDistance > currentDistance) {
        floodPeakDistance = currentDistance;
      }
    }

    // 3. Serial output
    Serial.print("["); Serial.print(timestamp); Serial.print("] ");
    Serial.print("Dist: "); Serial.print(currentDistance); Serial.print(" cm | ");
    Serial.print("Rise Speed: "); Serial.print(riseSpeed); Serial.print(" cm/s | ");
    Serial.print("Flood peak distance: "); Serial.print(floodPeakDistance); Serial.print(" cm");
    Serial.println(inFloodState ? "Status: POTENTIAL_FLOOD [ALERT]" : "Status: SAFE");

    previousDistance = currentDistance;
    lastCheckTime = currentTime;
  }

  // 4. Non-blocking LED blink
  if (ledBlinkActive && (currentTime - lastBlinkTime >= blinkInterval)) {
    ledState = !ledState;
    digitalWrite(PIN_LED, ledState ? HIGH : LOW);
    lastBlinkTime = currentTime;
  }

  delay(100);
}


import speech_recognition as sr
import requests
import os

AVATAR_URL = "http://127.0.0.1:5000/sanketsetu/send"


def send_to_avatar(text):
    try:
        response = requests.post(
            AVATAR_URL,
            json={"text": text},
            headers={"X-Pairing-Code": os.environ.get("SANKETSETU_PAIRING_CODE", "")},
            timeout=30
        )
        response.raise_for_status()

        result = response.json()

        if result.get("error"):
            print("Avatar processing failed:", result.get("message"))
            return

        print("Recognized speech:", result.get("original_text"))
        print("ISL structure:", result.get("isl_structure"))
        print("The avatar app has received the text.")

    except requests.RequestException as error:
        print("Could not connect to the avatar app.")
        print("Make sure it is running at http://127.0.0.1:5000")
        print(error)


def main():
    recognizer = sr.Recognizer()

    try:
        with sr.Microphone() as source:
            print("Calibrating microphone...")
            recognizer.adjust_for_ambient_noise(source, duration=1)

            print("Speak a sentence...")
            audio = recognizer.listen(source, timeout=15)

        print("Recognizing speech...")

        text = recognizer.recognize_google(
            audio,
            language="en-IN"
        )

        print("You said:", text)
        send_to_avatar(text)

    except sr.UnknownValueError:
        print("Sorry, I couldn't understand your speech.")

    except sr.RequestError as error:
        print("Speech recognition failed. Check your internet connection.")
        print(error)

    except sr.WaitTimeoutError:
        print("I didn't hear anything. Please try again.")

    except OSError as error:
        print("Microphone or audio error:", error)


if __name__ == "__main__":
    main()

# Real-Time Speech Translation App

A real-time speech translation application that captures audio, transcribes it using OpenAI's Whisper, translates the text, and generates speech output in multiple languages.

## Features

- Real-time audio capture and streaming
- Speech-to-text using OpenAI Whisper API
- Text translation between languages
- Text-to-speech using OpenAI TTS API
- WebSocket-based real-time communication
- Support for multiple languages: English, Japanese, Spanish, French, Korean

## Prerequisites

- Node.js (version 16 or higher)
- npm (comes with Node.js)
- OpenAI API key (get one from [OpenAI Platform](https://platform.openai.com/))

## Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mhpro15/translation_live.git
   cd translation_live
   ```

2. **Set up the backend:**
   ```bash
   cd backend
   npm install
   ```

3. **Set up the frontend:**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Configure environment variables:**

   Create a `.env` file in the `backend` directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

## Running the Application

1. **Start the backend server:**
   ```bash
   cd backend
   npm start
   ```
   The backend will start on port 3001.

2. **Start the frontend (in a new terminal):**
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will be available at http://localhost:3000.

## Usage

1. Open your browser and navigate to http://localhost:3000.
2. Select your source and target languages from the dropdown menus.
3. Click the microphone button to start audio capture.
4. Speak into your microphone - the app will transcribe, translate, and speak the translated text in real-time.
5. Use the play button to manually trigger TTS if needed.

## Project Structure

- `backend/` - Node.js/Express server with Socket.io for real-time communication
- `frontend/` - Next.js React application for the user interface
- `docs/` - Documentation and task specifications

## Development Notes

- Audio capture is optimized for low latency with 1.5-second chunks
- Uses Web Audio API for efficient audio processing
- OpenAI APIs handle STT, translation, and TTS for multi-language support

## Troubleshooting

- Ensure your microphone permissions are enabled in the browser
- Check that your OpenAI API key is correctly set in the `.env` file
- Make sure both backend and frontend servers are running

## License

This project is for educational purposes. Please check OpenAI's terms of service for API usage.

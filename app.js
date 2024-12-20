require("dotenv").config();
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const session = require("express-session");
const bodyParser = require("body-parser");
const app = express();
const fs = require("fs");
const { Configuration, OpenAIApi } = require("openai");
const { spawn } = require("child_process");
const gtts = require("node-gtts")("en");
const { getAudioDurationInSeconds } = require("get-audio-duration");
const { RateLimiterMemory } = require("rate-limiter-flexible");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const { LineClient } = require("messaging-api-line");

// get accessToken and channelSecret from LINE developers website
const client = new LineClient({
  accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.use(
  session({
    secret: "123",
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 86400000 * 30,
    },
  })
);

app.use(logger("dev"));
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use(cookieParser());
app.use("/public", express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Create a rate limiter object with a memory store
const limiter = new RateLimiterMemory({
  points: 1, // allow 1 point
  duration: 86400, // per day (in seconds)
});

app.get("/", async function (req, res) {
  res.send("Live");
});

// This function is used to return 'OK' to the client when a GET request is sent to the '/health' endpoint.

app.get("/health", async function (req, res) {
  res.send("OK");
});

//POST webhook callback
app.post("/webhook", async function (req, res) {
  const { events } = req.body;

  //webhook verification event without source
  if (events.length === 0) {
    return res.sendStatus(200);
  }

  let lineID = events[0].source.userId;
  const allowed = await isAllowed(lineID);

  if (!allowed) {
    console.log(`Line ID ${lineID} is not allowed at this time.`);
    await client.reply(events[0].replyToken, [
      client.createText(`Line ID ${lineID} is not allowed at this time.`),
    ]);

    return res.sendStatus(200);
  } else {
    if (events && events.length > 0) {
      try {
        await client
          .retrieveMessageContent(events[0].message.id)
          .then(async (buffer) => {
            const buff = Buffer.from(buffer, "base64");
            fs.writeFileSync("test.aac", buff);
            await transcribe("test.aac", lineID);
          });
      } catch (error) {
        console.error("Error retrieving message content:", error);
      }
    }

    return res.sendStatus(200);
  }
});

async function transcribe(filename, lineID) {
  try {
    const inputFile = fs.createReadStream(filename);
    const outputPath = filename.replace('.aac', '.mp3');
    const outputStream = fs.createWriteStream(outputPath);
    const convertion = spawn("ffmpeg", ["-i", "pipe:0", "-f", "mp3", "pipe:1"]);
    inputFile.pipe(convertion.stdin);
    convertion.stdout.pipe(outputStream);

    convertion.on('close', async (code) => {
      try {
        let y = fs.createReadStream('./test.mp3');
        const result = await openai.createTranscription(y, 'whisper-1');
        console.log(result.data.text);

        let improvement = await chatCorrector(result.data.text);
        let beautify = `Origin: ${result.data.text} \n\nImprovement: ${improvement}`;
        await client.pushText(lineID, beautify);
        await sendVoiceMessage(improvement, lineID);
      } catch (error) {
        console.error("Error during transcription process:", error);
      }
    });
  } catch (error) {
    console.error("Error in transcribe function:", error);
  }
}

async function chatCorrector(input) {
  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: "You are an English teacher and language corrector.",
        },
        {
          role: "user",
          content: `Please correct and improve the following sentence:\n\n${input}`,
        },
      ],
    });

    const correctedText = completion.data.choices[0]?.message?.content?.trim();
    console.log(correctedText);

    return correctedText || "Error: Unable to get a correction.";
  } catch (error) {
    console.error("Error correcting sentence:", error);
    return "An error occurred while trying to correct the sentence.";
  }
}
async function sendVoiceMessage(text, lineID) {
  const filepath = path.join(__dirname + "/public/", "return.wav");
  console.log(filepath);
  gtts.save(filepath, text, function () {
    getAudioDurationInSeconds(filepath).then(async (duration) => {
      await client.pushAudio(lineID, {
        originalContentUrl: process.env.WEB_HOST + "/public/return.wav",
        duration: duration * 1000,
      });
    });
  });
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
});

// Function that checks if a Line ID is allowed
async function isAllowed(lineID) {
  if (lineID === process.env.MY_ACCOUNT) {
    return true;
  }

  try {
    await limiter.consume(lineID);
    return true;
  } catch (err) {
    if (err instanceof Error && err.message === 'Too many requests') {
      return false;
    }
    console.error("Unexpected error in rate limiter:", err);
    return false; // Gracefully deny access on unexpected errors
  }
}

module.exports = app;

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require('express-session');
const bodyParser = require('body-parser');
const app = express();
const fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const {spawn} = require('child_process');
const gtts = require('node-gtts')('en');
const { getAudioDurationInSeconds } = require('get-audio-duration');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const { LineClient } = require('messaging-api-line');

// get accessToken and channelSecret from LINE developers website
const client = new LineClient({
  accessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.use(session({
    secret: '123',
    resave: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 86400000*30
    }
}));

app.use(logger('dev'));
app.use(express.json({limit: '30mb'}));
app.use(express.urlencoded({ extended: true ,limit: '30mb'}));
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

// Create a rate limiter object with a memory store
const limiter = new RateLimiterMemory({
  points: 1, // allow 1 point
  duration: 86400, // per day (in seconds)
});

app.get('/', async function(req, res) {
  res.send('Live');
})

// This function is used to return 'OK' to the client when a GET request is sent to the '/health' endpoint.

app.get('/health', async function(req, res) {
  res.send('OK');
})

//POST webhook callback
app.post('/webhook', async function(req, res) {
  const {events} = req.body;

  let lineID = events[0].source.userId;
  const allowed = await isAllowed(lineID);
  if (!allowed) {
    console.log(`Line ID ${lineID} is not allowed at this time.`);
    await client.reply(events[0].replyToken, `Line ID ${lineID} is not allowed at this time.`);
    return res.sendStatus(200);
  } else {
    if(events && events.length > 0 && !events[0].type == 'message'){
      await client.retrieveMessageContent(events[0].message.id).then(async(buffer) => {
        const buff = Buffer.from(buffer, 'base64');
        fs.writeFileSync('test.aac', buff);
        await transcribe('test.aac');
      });
    }
  
    return res.sendStatus(200);
  }
})

async function transcribe(filename) {
  const openai = new OpenAIApi(configuration);
  const inputFile = fs.createReadStream(filename);
  const outputPath = filename.replace('.aac','.mp3');
  const outputStream = fs.createWriteStream(outputPath);
  const convertion = spawn("ffmpeg", ["-i","pipe:0","-f","mp3","pipe:1",]);
  inputFile.pipe(convertion.stdin);
  convertion.stdout.pipe(outputStream);

  convertion.on('close', async (code) => {
    let y = fs.createReadStream('./test.mp3')
    const result = await openai.createTranscription(y, 'whisper-1');
    console.log(result.data.text)
    let improvement = await chatCorrector(result.data.text);
    let beautify = `Origin: ${result.data.text} \n\nImprovement: ${improvement}`;
    await client.pushText(process.env.MY_ACCOUNT, beautify);
    await sendVoiceMessage(improvement);
  });
}

async function chatCorrector (input){
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    temperature: 0.8,
    // prompt: "I want you to act as an English teacher, spelling corrector and improver. Answer the corrected and improved version of my text, in English. I want you to replace my simplified A0-level words and sentences with more beautiful and elegant, upper level English words and sentences. Keep the meaning same, but make them more literary. I want you to only reply the correction, the improvements and nothing else, do not write explanations, the text is: \n\n" + input 
    prompt: "Correct this to standard English:\n\n" + input,
  });
  
  console.log(completion.data.choices);
  return completion.data.choices[0].text.trim();
}

async function sendVoiceMessage(text) {
  const filepath = path.join(__dirname + '/public/', 'return.wav');
  console.log(filepath)
  gtts.save(filepath, text, function() {
    getAudioDurationInSeconds(filepath).then(async (duration) => {
      await client.pushAudio(process.env.MY_ACCOUNT, {
        originalContentUrl: process.env.WEB_HOST + '/public/return.wav',
        duration: duration * 1000,
      });
    })
  })
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
});



// Function that checks if a Line ID is allowed
async function isAllowed(lineID) {
  console.log(lineID, process.env.MY_ACCOUNT)
  if (lineID !== process.env.MY_ACCOUNT) {
    // Disallow all Line IDs except 123
    return false;
  }

  try {
    // Try to consume a point from the rate limiter
    await limiter.consume(lineID);
    return true; // Line ID is allowed
  } catch (err) {
    if (err instanceof Error && err.message === 'Too many requests') {
      // Line ID has exceeded the rate limit
      return false;
    }
    throw err; // re-throw unexpected error
  }
}

module.exports = app;
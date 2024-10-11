const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
// const { saveFeedback } = require("./feedbackdb");

const {
  saveChatHistories,
  loadChatHistories,
  saveAllowedMembers,
  loadAllowedMembers,
  normalizePhoneNumber,
  processAIRequest,
  createChatImage,
  convertPngToWebpAndClean,
  loadMembersData,
  historyFilePath,
  saveUnregisteredMembers,
  checkUnregisteredMembers,
  addTextToImage,
  members,
} = require("./utils");
require("dotenv").config();

let notifiedUnregisteredNumbers = [];

const groq_ai_token = process.env.GROQ_AI_TOKEN;
const googleApiKey = process.env.GOOGLE_API_KEY;
const customSearchEngineId = process.env.CUSTOM_SEARCH_ENGINE_ID;

const chatHistories = loadChatHistories();
const allowedMembers = loadAllowedMembers();
const express = require("express");
const qrcode = require("qrcode");
const app = express();
const port = process.env.PORT || 3000;

const stickerDir = path.join(__dirname, "stickerstorage");
if (!fs.existsSync(stickerDir)) {
  fs.mkdirSync(stickerDir);
}

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error("Error generating QR code:", err);
      return;
    }
    app.get("/qrcode", (req, res) => {
      res.send(`<img src="${url}" alt="QR Code">`);
    });
  });
});

app.listen(port, () => {
  console.log(`Memulai server, port : ${port}`);
});

client.on("ready", () => {
  console.log("Server siap!");
});

client.on("auth_failure", (message) => {
  console.error("Authentication failure:", message);
});

client.on("disconnected", (reason) => {
  console.log("Client was logged out:", reason);
});

const imageHistory = {};

client.on("message", async (msg) => {
  const userId = msg.from;
  const normalizedUserId = normalizePhoneNumber(userId);

  if (msg.body === ".hello") {
    msg.reply("Haloo");
  }
  else if (msg.body.startsWith(".gpict")) {
    if (msg.from.includes("@g.us")) {
      msg.reply("Pesan ini sudah tidak bisa dipakai di Group, gunakan pesan ini pada pesan pribadi!.");
    } else {
      const searchQuery = msg.body.slice(7).trim();
      try {
        const searchResponse = await axios.get(
          "https://www.googleapis.com/customsearch/v1",
          {
            params: {
              key: googleApiKey,
              cx: customSearchEngineId,
              q: searchQuery,
              searchType: "image",
              num: 10,
            },
          }
        );
        if (searchResponse.data.items && searchResponse.data.items.length > 0) {
          const filteredImages = searchResponse.data.items.filter((item) => {
            return (
              !imageHistory[searchQuery] ||
              !imageHistory[searchQuery].includes(item.link)
            );
          });

          if (filteredImages.length === 0) {
            msg.reply(
              "Gambar dengan nama tersebut sudah dicari, coba nama lain!."
            );
            filteredImages.push(...searchResponse.data.items);
          }
          const randomIndex = Math.floor(Math.random() * filteredImages.length);
          const imageUrl = filteredImages[randomIndex].link;
          if (!imageHistory[searchQuery]) {
            imageHistory[searchQuery] = [];
          }
          imageHistory[searchQuery].push(imageUrl);
          try {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
              throw new Error("Jaringan buruk");
            }
            const arrayBuffer = await imageResponse.arrayBuffer();
            const imageBuffer = Buffer.from(arrayBuffer);
            const media = new MessageMedia(
              "image/jpeg",
              imageBuffer.toString("base64"),
              "image.jpg"
            );
            await msg.reply(media);
            console.log("Gambar Terkirim!!");
          } catch (error) {
            console.error("Error while fetching image:", error.msg);
            msg.reply("Error saat mengunduh gambar, silahkan coba lagi.");
          }
        } else {
          msg.reply("Ngga ada gambar yang cocok, coba nama lain!");
        }
      } catch (error) {
        console.error("Error during Google image search:", error.msg);
        msg.reply(
          "Ngga bisa mencari gambar ini, limit API telah seluruhnya terpakai!"
        );
      }
    }
  }

  else if (msg.body.startsWith(".s")) {
    const parts = msg.body.split(" ");
    const command = parts[0];
    const author = parts.length > 1 ? parts.slice(1).join(" ") : "punya hfnyy";

    if (msg.hasQuotedMsg) {
      const quotedMessage = await msg.getQuotedMessage();

      if (quotedMessage.hasMedia) {
        const media = await quotedMessage.downloadMedia();
        console.log("Mendownload media");

        const mediaBuffer = Buffer.from(media.data, "base64");

        console.log("Membuat Stiker");
        const sticker = new Sticker(mediaBuffer)
          .setAuthor(author)
          .setType(StickerTypes.FULL);

        const stickerBuffer = await sticker.toBuffer();

        const stickerMedia = new MessageMedia(
          "image/webp",
          stickerBuffer.toString("base64"),
          "sticker.webp"
        );

        console.log("Mengirim stiker");
        client.sendMessage(msg.from, stickerMedia, { sendMediaAsSticker: true, quoted: msg });

        console.log("Stiker Terkirim!!");
      } else {
        msg.reply(
          "Balas pesan gambar dengan perintah .s untuk mengubahnya menjadi stiker."
        );
      }
    } else if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      console.log("Mendownload media");

      const mediaBuffer = Buffer.from(media.data, "base64");

      console.log("Membuat stiker");
      const sticker = new Sticker(mediaBuffer)
        .setAuthor(author)
        .setType(StickerTypes.FULL);

      const stickerBuffer = await sticker.toBuffer();

      const stickerMedia = new MessageMedia(
        "image/webp",
        stickerBuffer.toString("base64"),
        "sticker.webp"
      );

      console.log("Mengirim stiker");
      client.sendMessage(msg.from, stickerMedia, { sendMediaAsSticker: true, quoted: msg });

      console.log("Stiker Terkirim!!");
    } else {
      msg.reply(
        "Kirim gambar atau balas gambar dengan perintah .s untuk mengubahnya menjadi stiker."
      );
    }
  } else if (msg.body.startsWith(".cstiker")) {
    msg.reply(
      "Perintah telah di ubah, gunakan .s untuk membuat gambar menjadi stiker."
    );

  } else if (msg.body.startsWith(".smeme")) {
    const parts = msg.body.split(" ");
    const command = parts[0];
    const memeText = parts.length > 1 ? parts.slice(1).join(" ") : "";
    const author = "punya hfnyy";

    if (!memeText) {
      msg.reply("Tolong tambahkan teks meme setelah perintah .smeme");
      return;
    }

    if (msg.hasQuotedMsg) {
      const quotedMessage = await msg.getQuotedMessage();

      if (quotedMessage.hasMedia) {
        const media = await quotedMessage.downloadMedia();
        console.log("Mendownload media...");
        const mediaBuffer = Buffer.from(media.data, "base64");

        const imagePath = "./stickerstorage/meme_image.jpg";
        fs.writeFileSync(imagePath, mediaBuffer);

        const memeImagePath = await addTextToImage(imagePath, memeText);
        const memeBuffer = fs.readFileSync(memeImagePath);

        const sticker = new Sticker(memeBuffer)
          .setAuthor(author)
          .setType(StickerTypes.FULL);

        const stickerBuffer = await sticker.toBuffer();

        const stickerMedia = new MessageMedia(
          "image/webp",
          stickerBuffer.toString("base64"),
          "sticker.webp"
        );
        client.sendMessage(msg.from, stickerMedia, {
          sendMediaAsSticker: true,
        });
        console.log("Stiker Meme Terkirim!!");

        fs.unlinkSync(imagePath);
        fs.unlinkSync(memeImagePath);
      } else {
        msg.reply(
          "Balas pesan gambar dengan perintah .smeme <text> untuk mengubahnya menjadi meme stiker."
        );
      }
    } else if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      const mediaBuffer = Buffer.from(media.data, "base64");

      const imagePath = "./stickerstorage/meme_image.jpg";
      fs.writeFileSync(imagePath, mediaBuffer);

      const memeImagePath = await addTextToImage(imagePath, memeText);
      const memeBuffer = fs.readFileSync(memeImagePath);

      const sticker = new Sticker(memeBuffer)
        .setAuthor(author)
        .setType(StickerTypes.FULL);

      const stickerBuffer = await sticker.toBuffer();

      const stickerMedia = new MessageMedia(
        "image/webp",
        stickerBuffer.toString("base64"),
        "sticker.webp"
      );
      client.sendMessage(msg.from, stickerMedia, { sendMediaAsSticker: true });
      console.log("Stiker Meme Terkirim!!");

      fs.unlinkSync(imagePath);
      fs.unlinkSync(memeImagePath);
    } else {
      msg.reply(
        "Kirim gambar atau balas gambar dengan perintah .smeme <text> untuk mengubahnya menjadi meme stiker."
      );
    }
  } else if (msg.body.startsWith(".qc")) {
    console.log("Proses membuat stiker");

    let text = msg.body.slice(3).trim();

    try {
      if (!text && msg.hasQuotedMsg) {
        const quotedMessage = await msg.getQuotedMessage();
        text = quotedMessage.body;
        console.log("Teks terdeteksi : ", text);
      }

      if (!text) {
        msg.reply(
          "Tidak ada teks yang ditemukan. Silakan gunakan command .qc diikuti dengan teks atau balas pesan teks."
        );
        return;
      }

      const contact = await msg.getContact();
      const profilePicUrl = await contact.getProfilePicUrl();
      const displayName = contact.pushname || contact.number;

      console.log(
        "Info Kontak - Sumber PP : ",
        profilePicUrl,
        "Nama : ",
        displayName
      );

      const chatImagePath = await createChatImage(
        profilePicUrl,
        displayName,
        text
      );

      const webpPath = await convertPngToWebpAndClean(chatImagePath);

      const webpBuffer = fs.readFileSync(webpPath);
      const sticker = new Sticker(webpBuffer, {
        author: "hfnyy",
        type: StickerTypes.FULL,
        quality: 5,
      });

      const stickerBuffer = await sticker.toBuffer();

      fs.unlinkSync(webpPath);

      const stickerMedia = new MessageMedia(
        "image/webp",
        stickerBuffer.toString("base64"),
        "sticker.webp"
      );
      await client.sendMessage(msg.from, stickerMedia, {
        sendMediaAsSticker: true,
      });

      console.log("Stiker terkirim!!");
    } catch (error) {
      console.error("Error creating or sending sticker:", error);
      msg.reply("Terjadi kesalahan saat membuat stiker, silahkan coba lagi.");
    }
  } else if (msg.body === ".info") {
    let info = client.info;
    client.sendMessage(
      msg.from,
      `
        *Info BOT*
        Nama: ${info.pushname}
        No: 082333938293
        -------------------------
        Owner : 0881036176037
        Tiktok : https://www.tiktok.com/@hyfuni
        `
    );
  } else if (msg.body === ".everyone") {
    const chat = await msg.getChat();

    if (chat.isGroup) {
      let mentions = [];
      let text = "Everyone!";

      for (let participant of chat.participants) {
        mentions.push(participant.id._serialized);
      }

      await chat.sendMessage(text, { mentions });
    }
  }
  //  else if (msg.body.startsWith(".feedback ")) {
  //   const feedback = msg.body.slice(10).trim(); // Extract feedback text
  //   if (feedback) {
  //     saveFeedback(feedback, (err, result) => {
  //       if (err) {
  //         msg.reply("Terjadi kesalahan saat menyimpan feedback Anda.");
  //       } else {
  //         msg.reply("Feedback diterima, terimakasih feedbacknya!");
  //       }
  //     });
  //   } else {
  //     msg.reply("Feedback tidak boleh kosong.");
  //   }
  // }
  else if (msg.body === ".clearchat") {
    const authorizedNumber = "62881036176037";

    if (normalizedUserId === authorizedNumber) {
      try {
        Object.keys(chatHistories).forEach((key) => {
          delete chatHistories[key];
        });

        fs.writeFileSync(
          historyFilePath,
          JSON.stringify(chatHistories, null, 2)
        );

        console.log("Chat history cleared.");
        await msg.reply("Semua riwayat chat telah dihapus.");
      } catch (error) {
        console.error("Error while clearing chat history:", error);
        await msg.reply(
          "Terjadi kesalahan saat menghapus riwayat chat, silakan coba lagi."
        );
      }
    } else {
      console.log(
        `Nomor ${userId} tidak diizinkan untuk mengakses perintah ini.`
      );
      await msg.reply(
        "Anda tidak memiliki izin untuk menggunakan perintah ini."
      );
    }
  } else {
    const isRegistered =
      members.registered.find(
        (member) => member.number === normalizedUserId
      ) !== undefined;

    const isUnregistered = members.unregistered.includes(normalizedUserId);

    if (!isRegistered) {
      if (!isUnregistered) {
        if (!notifiedUnregisteredNumbers.includes(normalizedUserId)) {
          notifiedUnregisteredNumbers.push(normalizedUserId);

          const notificationMessage = `Nomor ${normalizedUserId} melakukan request.`;
          await client.sendMessage(
            "120363337195015641@g.us",
            notificationMessage
          );

          console.log(
            `Nomor ${normalizedUserId} tidak terdaftar. Notifikasi terkirim.`
          );

          members.unregistered.push(normalizedUserId); // Simpan hanya nomor
          saveUnregisteredMembers(members);
        } else {
          console.log(
            `Nomor ${normalizedUserId} tidak terdaftar. Sudah pernah diberi notifikasi.`
          );
        }
      } else {
        console.log(
          `Nomor ${normalizedUserId} sudah ada di daftar unregistered.`
        );
      }
    }
    //
    if (msg.body.startsWith(".reg ")) {
      const newNumber = msg.body.split(" ")[1];
      const normalizedNewNumber = normalizePhoneNumber(newNumber);

      if (newNumber) {
        if (!allowedMembers.includes(normalizedNewNumber)) {
          allowedMembers.push(normalizedNewNumber);
          saveAllowedMembers(allowedMembers);
          console.log(`Nomor ${normalizedNewNumber} berhasil didaftarkan.`);
          await msg.reply(
            `Nomor ${normalizedNewNumber} Berhasil di masukkan ke database.`
          );
        } else {
          console.log(`Nomor ${normalizedNewNumber} sudah terdaftar.`);
          await msg.reply(
            `Nomor ${normalizedNewNumber} Sudah ada di database.`
          );
        }
      } else {
        console.log(`Format perintah .reg salah.`);
        await msg.reply("Format perintah salah. Gunakan: .register (nomor)");
      }
      return;
    }

    if (!allowedMembers.includes(normalizedUserId)) {
      console.log(`Nomor ${userId} tidak terdaftar. Chat tidak direspon.`);
      return;
    }

    if (!chatHistories[userId]) {
      chatHistories[userId] = [];
    }

    const msgBody = msg.body.trim();
    let query = "";

    if (msgBody.startsWith(",")) {
      query = msgBody.slice(1).trim();
    } else if (msgBody.toLowerCase().startsWith("arisu")) {
      query = msgBody.slice(5).trim();
    }

    if (query) {
      const senderId = msg.author || msg.from;
      const normalizedSenderId = normalizePhoneNumber(senderId);

      const contact = await msg.getContact();
      const senderName = contact.pushname || contact.name || "tidak ada nama";

      chatHistories[userId].push({
        role: "user",
        content: query,
        sender: normalizedSenderId,
        name: senderName,
      });

      await processAIRequest(userId, chatHistories, msg, query, groq_ai_token);
      saveChatHistories(chatHistories);
    }
    // else {
    //   // console.log(`Pesan masuk dari ${userId}.`);
    // }
  }
});

client.on("group_join", async (notification) => {
  const chat = await notification.getChat();
  const user = notification.recipientIds[0];
  const userContact = await client.getContactById(user);
  chat.sendMessage(
    `Selamat datang ${userContact.pushname || userContact.number
    }! Semoga betah disini, karena anomali disini semuanya rada-rada🗿`,
    { mentions: [userContact] }
  );
  console.log("User join", userContact.pushname);
});

client.on("group_leave", async (notification) => {
  const chat = await notification.getChat();
  const user = notification.recipientIds[0];
  const userContact = await client.getContactById(user);
  chat.sendMessage(
    `Yahh, ${userContact.pushname || userContact.number} Udah keluar. `,
    { mentions: [userContact] }
  );
  console.log("User leave", userContact.pushname);
});

client.initialize();

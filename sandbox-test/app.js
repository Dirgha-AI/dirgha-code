const express = require("express");

const app = express();

app.get("/ping", (_req, res) => {
  res.json({ pong: true });
});

app.get("/echo", (req, res) => {
  const msg = req.query.msg;
  if (!msg) {
    return res.status(400).json({ error: "msg query parameter is required" });
  }
  res.json({ echo: msg });
});

module.exports = app;

import { WebSocketServer } from "ws";
const wss = new WebSocketServer({ port: 26760 });
let total = 0;
wss.on("connection", (socket) => {
  console.log("CLIENT_CONNECTED");
  socket.on("message", (data) => {
    total++;
    if (total <= 2) console.log("PACKET", data.length, Buffer.from(data).toString("hex"));
  });
  socket.on("close", () => console.log("CLIENT_CLOSED total=" + total));
});
console.log("LISTENING 26760");

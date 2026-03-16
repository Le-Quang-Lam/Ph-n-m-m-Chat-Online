const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sql = require("mssql");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Cấu hình Middleware
app.use(express.static("public"));
app.use(express.json()); // Đọc dữ liệu JSON từ Client gửi lên

// --- CẤU HÌNH SQL SERVER ---
const config = {
  user: "sa",
  password: "123456",
  server: "localhost",
  database: "HeThongChat",
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
};

const poolPromise = sql
  .connect(config)
  .then((pool) => {
    console.log("✅ Kết nối SQL Server thành công!");
    return pool;
  })
  .catch((err) => {
    console.error("❌ Kết nối SQL Server thất bại: ", err);
    process.exit(1);
  });

let users = {};

io.on("connection", (socket) => {
  socket.on("join", async (username) => {
    users[socket.id] = username;
    io.emit("user list", Object.values(users));

    try {
      const pool = await poolPromise;
      const result = await pool
        .request()
        .query(
          "SELECT TOP 100 NguoiGui, NoiDung FROM LichSuChat ORDER BY ThoiGian ASC",
        );

      socket.emit("load history", result.recordset);
    } catch (err) {
      console.error("Lỗi tải lịch sử:", err);
    }
  });

  socket.on("chat message", async (data) => {
    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("sender", sql.NVarChar, data.user)
        .input("content", sql.NVarChar, data.text)
        .query(
          "INSERT INTO LichSuChat (NguoiGui, NoiDung) VALUES (@sender, @content)",
        );

      io.emit("chat message", data);
    } catch (err) {
      console.error("Lỗi lưu tin nhắn:", err);
    }
  });

  socket.on("disconnect", () => {
    delete users[socket.id];
    io.emit("user list", Object.values(users));
  });
});

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const pool = await poolPromise;

    const checkUser = await pool
      .request()
      .input("user", sql.NVarChar, username)
      .query("SELECT * FROM TaiKhoan WHERE TenDangNhap = @user");

    if (checkUser.recordset.length > 0) {
      return res.status(400).json({ message: "Tên đăng nhập đã tồn tại!" });
    }

    await pool
      .request()
      .input("user", sql.NVarChar, username)
      .input("pass", sql.NVarChar, password)
      .query(
        "INSERT INTO TaiKhoan (TenDangNhap, MatKhau) VALUES (@user, @pass)",
      );

    res.json({ message: "Đăng ký thành công!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi kết nối database!" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .input("user", sql.NVarChar, username)
      .input("pass", sql.NVarChar, password)
      .query(
        "SELECT * FROM TaiKhoan WHERE TenDangNhap = @user AND MatKhau = @pass",
      );

    if (result.recordset.length > 0) {
      res.json({ message: "Đăng nhập thành công!", username: username });
    } else {
      res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu!" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi hệ thống!" });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
});

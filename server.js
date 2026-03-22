
require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");  // your app is imported

mongoose.connect(process.env.MONGO_URI)
  .then((conn) => {
    console.log("MongoDB Connected:", conn.connection.host);
  })
  .catch((err) => console.error("MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

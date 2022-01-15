const express = require('express');
const router = express.Router();

const statistics = require("../statistics.js")

/* GET home page. */
router.get("/", function(req, res) {
   
   res.render("splash.ejs", {
      gamesAborted: statistics.gamesAborted,
      strongerColor: statistics.strongerColor,
      gamesStarted: statistics.gamesStarted,
   });
});

router.get("/play", function(req, res) {

   res.sendFile("game.html", { root : "./public"}); 
});

module.exports = router;

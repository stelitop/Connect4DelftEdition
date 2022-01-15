const express = require("express");
const http = require("http");
const indexRouter = require("./routes/index");
const websocket = require("ws");
const statistics = require("./statistics.js")

const gamemodule = require("./game")
const socketmessages = require("./public/javascripts/socketmessages.js")

if (process.argv.length < 3) {
    console.log("Usage: node app.js <port>");
    process.exit(1);
}

const port = process.env.PORT || process.argv[2];
const app = express();

app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

app.get("/play", indexRouter);
app.get("/", indexRouter);

app.use(express.static(__dirname + "/public"));

const server = http.createServer(app);
const wss = new websocket.Server({ server });

// contains the websockets of the player clients
let playerQueue = [];
let nextId = 0;

let playerGames = {};


wss.on("connection", function(ws) {
    // on connection it should put the player in queue
    
    const curId = nextId;
    ws.on("message", function(msg) {

        console.log("[LOG] " + msg);
        let data = JSON.parse(msg);
        if (data.type == "dropdisc") {
            let curGame = playerGames[curId];
            if (curGame == null) return;
            // check if the player can drop a disc
            if (curGame.finished) return;
            if (curGame.currentPlayer == 1 && curGame.playerB == ws) return;
            if (curGame.currentPlayer == -1 && curGame.playerA == ws) return;

            // checks if the move was legal or not
            if (!curGame.dropDisc(data.column)) {
                if (curGame.currentPlayer == 1) curGame.playerA.send(socketmessages.ILLEGALMOVE("This column is full."));
                else curGame.playerB.send(socketmessages.ILLEGALMOVE("This column is full."));
                return;
            }

            curGame.playerA.send(socketmessages.SHOWBOARD(curGame, 1));
            curGame.playerB.send(socketmessages.SHOWBOARD(curGame, -1));

            let winner = curGame.checkForWinner();

            if (winner != 0) {
                statistics.strongerColor += winner;

                curGame.playerA.send(socketmessages.GAMECOMPLETE(winner, 1));
                curGame.playerB.send(socketmessages.GAMECOMPLETE(winner, -1));
                curGame.endGame();
                curGame.playerA.send(socketmessages.SCORES(curGame));
                curGame.playerB.send(socketmessages.SCORES(curGame));
            } else if (curGame.checkForDraw()) {
                curGame.playerA.send(socketmessages.GAMECOMPLETE(winner, 1));
                curGame.playerB.send(socketmessages.GAMECOMPLETE(winner, -1));
                curGame.endGame();
            }
        } else if (data.type == "requestrematch") {
            let curGame = playerGames[curId];
            if (!curGame.finished) return;
            if (!curGame.allowRematch) return;

            if (curGame.playerA == ws) {
                curGame.rematchA = !curGame.rematchA;
                if (curGame.rematchA) {
                    curGame.playerA.send(socketmessages.REMATCHCOLOR("#A50034", "Waiting for opponent to accept..."));
                    curGame.playerB.send(socketmessages.REMATCHCOLOR("#6CC24A", "Your opponent offers a rematch!"));
                }
                else {
                    curGame.playerA.send(socketmessages.REMATCHCOLOR("#6CC24A", "Rematch cancelled."));
                    curGame.playerB.send(socketmessages.REMATCHCOLOR("#6CC24A", "Rematch offer cancelled."));
                }
            }
            else {
                curGame.rematchB = !curGame.rematchB;
                if (curGame.rematchB) {
                    curGame.playerB.send(socketmessages.REMATCHCOLOR("#A50034", "Waiting for opponent to accept..."));
                    curGame.playerA.send(socketmessages.REMATCHCOLOR("#6CC24A", "Your opponent offers a rematch!"));
                }
                else {
                    curGame.playerB.send(socketmessages.REMATCHCOLOR("#6CC24A", "Rematch cancelled."));
                    curGame.playerA.send(socketmessages.REMATCHCOLOR("#6CC24A", "Rematch offer cancelled!"));
                }
            }

            if (curGame.rematchA && curGame.rematchB) {
                //reset game
                curGame.reset();
                curGame.playerA.send(socketmessages.SHOWBOARD(curGame, 1));
                curGame.playerB.send(socketmessages.SHOWBOARD(curGame, -1));
                curGame.rematchA = false;
                curGame.rematchB = false;
                statistics.gamesStarted++;

                curGame.playerA.send(socketmessages.REMATCHCOLOR("#6CC24A", ""));
                curGame.playerB.send(socketmessages.REMATCHCOLOR("#6CC24A", ""));
                curGame.playerA.send(socketmessages.STARTGAMEINFO(curGame.currentPlayer));
                curGame.playerB.send(socketmessages.STARTGAMEINFO(-curGame.currentPlayer));
            }
        }
    })

    ws.on("close", function(code) {
        // if the player left in the queue
        if (playerQueue.length == 1 && playerQueue[0] == ws) {
            playerQueue = [];
        }
        // if the player left during a game
        else {
            let curGame = playerGames[curId];
            if (curGame.finished)  {

                if (curGame.playerA != ws) curGame.playerA.send(socketmessages.REMATCHCOLOR("#636363", "Your opponent left the lobby."));
                else curGame.playerB.send(socketmessages.REMATCHCOLOR("#636363", "Your opponent left the lobby."));
                
                curGame.allowRematch = false;

                return;
            }
            
            if (curGame.playerA != ws) curGame.playerA.send(socketmessages.ABORTGAME());
            else curGame.playerB.send(socketmessages.ABORTGAME());
            curGame.finished = true;
            //increment statistics 
            statistics.gamesAborted++;
        }
    })

    playerQueue.push(ws);
    
    if (playerQueue.length == 2) {
        let newGame = new gamemodule.Game(nextId);
        console.log("[LOG] " + newGame.currentPlayer);
        newGame.playerA = playerQueue[0];
        newGame.playerB = playerQueue[1];

        const curId = nextId;
        nextId++;

        playerGames[curId] = newGame;
        playerGames[curId] = newGame;

        playerQueue[0].send(socketmessages.SHOWBOARD(newGame, 1));
        playerQueue[1].send(socketmessages.SHOWBOARD(newGame, -1));
    
        playerQueue[0].send(socketmessages.STARTGAMEINFO(newGame.currentPlayer));
        playerQueue[1].send(socketmessages.STARTGAMEINFO(-newGame.currentPlayer));

        playerQueue = [];

        statistics.gamesStarted++;
    }
})

server.listen(port);
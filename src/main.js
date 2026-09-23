import "./style.css";
import { createGame } from "./game.js";

const startOverlay = document.getElementById("start-overlay");
const endOverlay = document.getElementById("end-overlay");
const startButton = document.getElementById("lead-the-way");
const replayButton = document.getElementById("replay");
const canvas = document.getElementById("world");
const finalScore = document.getElementById("final-score");

const game = createGame(canvas, {
  root: document.getElementById("play-hud"),
  waterFill: document.getElementById("water-fill"),
  timer: document.getElementById("timer"),
  score: document.getElementById("score"),
  onGameOver(score) {
    finalScore.textContent = score;
    endOverlay.classList.remove("is-hidden");
    endOverlay.setAttribute("aria-hidden", "false");
    replayButton.focus();
  },
});

function hide(el) {
  el.classList.add("is-hidden");
  el.setAttribute("aria-hidden", "true");
}

function beginGame() {
  hide(startOverlay);
  hide(endOverlay);
  game.start();
}

startButton.addEventListener("click", beginGame);
replayButton.addEventListener("click", beginGame);

window.addEventListener("load", () => {
  game.drawIdle();
  startButton.focus();
});

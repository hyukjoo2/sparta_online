// /src/app/constants.js
export const DEFAULT_BG_LIST = [
  "./bglist/background_ep01_01.png",
  "./bglist/background_ep01_02.bmp",
  "./bglist/background_ep01_03.gif",
  "./bglist/background_ep01_04.png",
  "./bglist/background_ep01_05.jpg",
  "./bglist/background_ep01_06.jpg",
  "./bglist/background_ep01_07.png",
  "./bglist/background_ep01_08.png",
  "./bglist/background_ep01_10.png",
];

export const DEFAULT_BGMUSIC = [
  "./bgmusic/01_Recluse.mp3",
  "./bgmusic/02_The_Blood_Pledge.mp3",
  "./bgmusic/03_Against_Odds.mp3",
  "./bgmusic/04_A_New_Hope.mp3",
  "./bgmusic/05_Under_Siege.mp3",
  "./bgmusic/08_Man_of_Honor.mp3",
  "./bgmusic/11_Your_Wish.mp3",
  "./bgmusic/12_Eternally.mp3",
  "./bgmusic/13_Vagabonds.mp3",
  "./bgmusic/14_Moonlight.mp3",
  "./bgmusic/15_If.mp3",
  "./bgmusic/17_Town_All_Our_Wants.mp3",
  "./bgmusic/19_Desperate_Moment.mp3",
];

export const CHATLOG_INTERVAL_MS = 3000;
export const BG_INTERVAL_MS = 20000;

export const MAX_LEVEL = 50;
export const MAX_CURRENT_INDICATOR = 50000;

// Local LLM
export const LLM_ENDPOINT = "http://127.0.0.1:8000/chat";
export const LLM_MAX_TURNS = 20;
export const USE_OLLAMA_ON_NORMAL_CHAT = true;

export const OLLAMA_SPEAKER_POOL = [
  "헤헤곰인형",
  "사탕쥴게가자",
  "생각창고",
  "얼마즐",
  "천마대혈겁풍",
  "자면족밥된다",
  "암바시술소",
  "척추절단에바",
  "미스릴수저",
  "엘릭서마시고싶다",
  "도펠광어",
  "헨젤과그랫데",
  "네크로멘시",
  "두딸모두오크",
  "조카신발색깔",
];

// API Origin detect
export const API_ORIGIN_KEY = "sparta_api_origin";
export const API_PROBE_PORTS = [8000, 3000, 5000, 8080, 8787, 5173, 5500];
export const API_PATH_PROBE = "/api/adena";
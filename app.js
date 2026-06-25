(() => {
  const CONFIG = {
    apiUrl: "https://script.google.com/macros/s/AKfycbxwnQIMY-k6bliNRkTUOmC34TUxFt22O4G1_A79vkrhkfcSrEiCAeiF78uBKs-oUS_d/exec",
    localPreviewCode: "ogu2026",
    maxScorePerGame: 1000,
    maxTickets: 5,
    storagePrefix: "classroom_arcade_v2_"
  };

  const GAME_META = {
    nono: {
      title: "네모네모",
      kicker: "Logic",
      scoreField: "nonoScore",
      difficulties: [
        { label: "초급", detail: "5 x 5", size: 5, points: 10 },
        { label: "중급", detail: "8 x 8", size: 8, points: 30 },
        { label: "고급", detail: "10 x 10", size: 10, points: 70 }
      ]
    },
    pipe: {
      title: "배관공",
      kicker: "Path",
      scoreField: "pipeScore",
      difficulties: [
        { label: "초급", detail: "5 x 5", size: 5, points: 10, minLen: 12, branches: 4, branchMax: 2 },
        { label: "중급", detail: "6 x 6", size: 6, points: 25, minLen: 18, branches: 7, branchMax: 3 },
        { label: "고급", detail: "7 x 7", size: 7, points: 45, minLen: 26, branches: 11, branchMax: 4 }
      ]
    },
    g2048: {
      title: "2048",
      kicker: "Slide",
      scoreField: "g2048Score",
      difficulties: [
        { label: "Easy", detail: "5 x 5", size: 5, points: 10 },
        { label: "Normal", detail: "4 x 4", size: 4, points: 30 },
        { label: "Hard", detail: "3 x 3", size: 3, points: 90 }
      ]
    },
    mine: {
      title: "지뢰찾기",
      kicker: "Risk",
      scoreField: "mineScore",
      difficulties: [
        { label: "쉬움", detail: "9 x 9 / 지뢰 10", size: 9, mines: 10, points: 10 },
        { label: "보통", detail: "12 x 12 / 지뢰 22", size: 12, mines: 22, points: 30 },
        { label: "어려움", detail: "15 x 15 / 지뢰 40", size: 15, mines: 40, points: 55 }
      ]
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const byId = (id) => document.getElementById(id);

  const state = {
    accessCode: "",
    currentUser: null,
    ranking: [],
    currentGame: "",
    activeGame: null,
    toastTimer: null,
    touchStart: null
  };

  const defaultUser = (name) => ({
    name,
    score: 0,
    tickets: 3,
    nonoScore: 0,
    pipeScore: 0,
    g2048Score: 0,
    mineScore: 0
  });

  const normalizeUser = (user, fallbackName) => {
    const merged = { ...defaultUser(fallbackName), ...(user || {}) };
    return {
      name: String(merged.name || fallbackName).trim(),
      score: Number(merged.score) || 0,
      tickets: Number.isFinite(Number(merged.tickets)) ? Number(merged.tickets) : 3,
      nonoScore: Number(merged.nonoScore) || 0,
      pipeScore: Number(merged.pipeScore) || 0,
      g2048Score: Number(merged.g2048Score) || 0,
      mineScore: Number(merged.mineScore) || 0
    };
  };

  const storageKey = (key) => CONFIG.storagePrefix + key;

  const showLoading = (text = "불러오는 중") => {
    byId("loadingText").textContent = text;
    byId("loadingOverlay").classList.remove("hidden");
  };

  const hideLoading = () => {
    byId("loadingOverlay").classList.add("hidden");
  };

  const toast = (message) => {
    const el = byId("toast");
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.classList.add("hidden"), 2200);
  };

  const endpointUrl = (action, params = {}) => {
    const url = new URL(CONFIG.apiUrl);
    url.searchParams.set("action", action);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  };

  const localUsers = () => JSON.parse(localStorage.getItem(storageKey("local_users")) || "{}");

  const saveLocalUsers = (users) => {
    localStorage.setItem(storageKey("local_users"), JSON.stringify(users));
  };

  const backend = {
    async getUser(name, code) {
      if (!CONFIG.apiUrl) {
        if (code !== CONFIG.localPreviewCode) throw new Error("입장코드가 맞지 않습니다.");
        const users = localUsers();
        if (!users[name]) users[name] = defaultUser(name);
        saveLocalUsers(users);
        return users[name];
      }
      const res = await fetch(endpointUrl("getUser", { name, code }));
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "입장할 수 없습니다.");
      return data.user;
    },

    async saveUser(user, code) {
      if (!CONFIG.apiUrl) {
        const users = localUsers();
        users[user.name] = user;
        saveLocalUsers(users);
        return { ok: true };
      }
      const res = await fetch(CONFIG.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "saveUser", code, user })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "저장 실패");
      return data;
    },

    async getRanking(code) {
      if (!CONFIG.apiUrl) {
        return Object.values(localUsers()).sort((a, b) => (b.score || 0) - (a.score || 0));
      }
      const res = await fetch(endpointUrl("getRanking", { code }));
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "랭킹 불러오기 실패");
      return data.ranking || [];
    }
  };

  const renderHub = () => {
    const user = state.currentUser;
    byId("welcomeTitle").textContent = `${user.name} 라운지`;
    byId("totalScore").textContent = user.score.toLocaleString();
    byId("ticketCount").textContent = user.tickets;
    byId("gameTicketCount").textContent = user.tickets;

    Object.entries(GAME_META).forEach(([key, meta]) => {
      byId(`${key}ProgressText`).textContent = `${user[meta.scoreField]} / ${CONFIG.maxScorePerGame}`;
    });

    const index = state.ranking.findIndex((r) => r.name === user.name);
    byId("myRank").textContent = index >= 0 ? `${index + 1}위` : "-";
    renderRanking();
  };

  const renderRanking = () => {
    const list = byId("leaderboardList");
    list.innerHTML = "";
    const top = state.ranking.slice(0, 12);
    if (!top.length) {
      list.innerHTML = `<li><span class="rank-badge">-</span><span class="rank-name">아직 기록이 없습니다</span><span class="rank-score">0</span></li>`;
      return;
    }
    top.forEach((row, index) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="rank-badge">${index + 1}</span>
        <span class="rank-name">${escapeHtml(row.name)}</span>
        <span class="rank-score">${Number(row.score || 0).toLocaleString()}</span>
      `;
      list.appendChild(li);
    });
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[ch]));

  const refreshRanking = async () => {
    state.ranking = await backend.getRanking(state.accessCode);
    renderHub();
  };

  const saveUser = async () => {
    await backend.saveUser(state.currentUser, state.accessCode);
    await refreshRanking();
  };

  const showScreen = (screenId) => {
    ["loginScreen", "hubScreen", "gameScreen"].forEach((id) => byId(id).classList.toggle("hidden", id !== screenId));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const code = byId("classCodeInput").value.trim();
    const name = byId("studentNameInput").value.trim();
    if (name.length < 2) {
      byId("loginStatus").textContent = "이름을 확인해 주세요.";
      return;
    }
    showLoading("입장 확인 중");
    try {
      state.accessCode = code;
      state.currentUser = normalizeUser(await backend.getUser(name, code), name);
      localStorage.setItem(storageKey("last_name"), name);
      await refreshRanking();
      showScreen("hubScreen");
      toast(CONFIG.apiUrl ? "연결 완료" : "로컬 미리보기 모드");
    } catch (error) {
      byId("loginStatus").textContent = error.message || "입장할 수 없습니다.";
    } finally {
      hideLoading();
    }
  };

  const logout = () => {
    state.accessCode = "";
    state.currentUser = null;
    state.ranking = [];
    byId("classCodeInput").value = "";
    showScreen("loginScreen");
  };

  const openGame = (gameKey) => {
    state.currentGame = gameKey;
    state.activeGame = null;
    const meta = GAME_META[gameKey];
    byId("gameKicker").textContent = meta.kicker;
    byId("gameTitle").textContent = meta.title;
    renderDifficulties(gameKey);
    byId("gamePanel").classList.add("hidden");
    byId("difficultyPanel").classList.remove("hidden");
    showScreen("gameScreen");
  };

  const renderDifficulties = (gameKey) => {
    const meta = GAME_META[gameKey];
    const panel = byId("difficultyPanel");
    panel.innerHTML = `<div class="difficulty-list"></div>`;
    const list = panel.querySelector(".difficulty-list");
    meta.difficulties.forEach((diff, index) => {
      const button = document.createElement("button");
      button.className = "difficulty-button";
      button.type = "button";
      button.innerHTML = `
        <span><strong>${diff.label}</strong><span>${diff.detail}</span></span>
        <span class="reward-pill">+${diff.points}</span>
      `;
      button.addEventListener("click", () => startGame(gameKey, index));
      list.appendChild(button);
    });
  };

  const startGame = (gameKey, difficultyIndex) => {
    const diff = GAME_META[gameKey].difficulties[difficultyIndex];
    byId("difficultyPanel").classList.add("hidden");
    byId("gamePanel").classList.remove("hidden");
    if (gameKey === "nono") startNono(diff);
    if (gameKey === "pipe") startPipe(diff);
    if (gameKey === "g2048") start2048(diff);
    if (gameKey === "mine") startMine(diff);
  };

  const returnToDifficulty = () => {
    state.activeGame = null;
    byId("gamePanel").innerHTML = "";
    byId("gamePanel").classList.add("hidden");
    byId("difficultyPanel").classList.remove("hidden");
  };

  const backToHub = () => {
    state.activeGame = null;
    byId("gamePanel").innerHTML = "";
    showScreen("hubScreen");
    renderHub();
  };

  const consumeTicketAndQuit = async () => {
    if (!state.currentUser.tickets) {
      toast("티켓이 부족합니다.");
      return;
    }
    state.currentUser.tickets -= 1;
    showLoading("저장 중");
    try {
      await saveUser();
      returnToDifficulty();
      toast("티켓 1장을 사용했습니다.");
    } finally {
      hideLoading();
    }
  };

  const applyWin = async (gameKey, points, message) => {
    const meta = GAME_META[gameKey];
    const current = state.currentUser[meta.scoreField];
    const add = Math.max(0, Math.min(points, CONFIG.maxScorePerGame - current));
    state.currentUser[meta.scoreField] += add;
    state.currentUser.score += add;
    state.currentUser.tickets = Math.min(CONFIG.maxTickets, state.currentUser.tickets + 1);
    showLoading("기록 저장 중");
    try {
      await saveUser();
      toast(add ? `${message} +${add}점` : "이번 시즌 점수 상한에 도달했습니다.");
      setTimeout(returnToDifficulty, 900);
    } finally {
      hideLoading();
    }
  };

  const toolbar = (buttons) => {
    const bar = document.createElement("div");
    bar.className = "play-toolbar";
    buttons.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `tool-button ${item.className || ""}`;
      btn.textContent = item.label;
      btn.addEventListener("click", item.onClick);
      if (item.id) btn.id = item.id;
      bar.appendChild(btn);
    });
    return bar;
  };

  function getNonoClues(line) {
    const clues = [];
    let count = 0;
    for (const value of line) {
      if (value) count += 1;
      else if (count) {
        clues.push(count);
        count = 0;
      }
    }
    if (count) clues.push(count);
    return clues.length ? clues : [0];
  }

  function getNonoPermutations(length, clues) {
    if (clues.length === 1 && clues[0] === 0) return [Array(length).fill(0)];
    const result = [];
    const solve = (idx, clueIdx, row) => {
      if (clueIdx === clues.length) {
        result.push([...row, ...Array(length - row.length).fill(0)]);
        return;
      }
      let rest = 0;
      for (let i = clueIdx + 1; i < clues.length; i += 1) rest += clues[i] + 1;
      const maxStart = length - rest - clues[clueIdx];
      for (let start = idx; start <= maxStart; start += 1) {
        const next = [...row, ...Array(start - row.length).fill(0), ...Array(clues[clueIdx]).fill(1)];
        if (clueIdx < clues.length - 1) next.push(0);
        solve(next.length, clueIdx + 1, next);
      }
    };
    solve(0, 0, []);
    return result;
  }

  function isNonoSolvable(size, rowClues, colClues) {
    const grid = Array.from({ length: size }, () => Array(size).fill(-1));
    const rowPerms = rowClues.map((clues) => getNonoPermutations(size, clues));
    const colPerms = colClues.map((clues) => getNonoPermutations(size, clues));
    let changed = true;
    let rounds = 0;
    while (changed && rounds < 30) {
      changed = false;
      rounds += 1;
      for (let r = 0; r < size; r += 1) {
        const valid = rowPerms[r].filter((perm) => perm.every((v, c) => grid[r][c] === -1 || grid[r][c] === v));
        if (!valid.length) return false;
        rowPerms[r] = valid;
        for (let c = 0; c < size; c += 1) {
          if (grid[r][c] !== -1) continue;
          const first = valid[0][c];
          if (valid.every((perm) => perm[c] === first)) {
            grid[r][c] = first;
            changed = true;
          }
        }
      }
      for (let c = 0; c < size; c += 1) {
        const valid = colPerms[c].filter((perm) => perm.every((v, r) => grid[r][c] === -1 || grid[r][c] === v));
        if (!valid.length) return false;
        colPerms[c] = valid;
        for (let r = 0; r < size; r += 1) {
          if (grid[r][c] !== -1) continue;
          const first = valid[0][r];
          if (valid.every((perm) => perm[r] === first)) {
            grid[r][c] = first;
            changed = true;
          }
        }
      }
    }
    return grid.every((row) => row.every((cell) => cell !== -1));
  }

  function generateNono(size) {
    const density = size <= 5 ? 0.58 : size <= 8 ? 0.52 : 0.48;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => (Math.random() < density ? 1 : 0)));
      for (let r = 0; r < size; r += 1) if (grid[r].every((v) => !v)) grid[r][Math.floor(Math.random() * size)] = 1;
      for (let c = 0; c < size; c += 1) if (grid.every((row) => !row[c])) grid[Math.floor(Math.random() * size)][c] = 1;
      const rowClues = grid.map(getNonoClues);
      const colClues = Array.from({ length: size }, (_, c) => getNonoClues(grid.map((row) => row[c])));
      if (isNonoSolvable(size, rowClues, colClues)) return { grid, rowClues, colClues };
    }
    const grid = Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => (r === c || r + c === size - 1 ? 1 : 0)));
    return {
      grid,
      rowClues: grid.map(getNonoClues),
      colClues: Array.from({ length: size }, (_, c) => getNonoClues(grid.map((row) => row[c])))
    };
  }

  function startNono(diff) {
    const level = generateNono(diff.size);
    state.activeGame = {
      type: "nono",
      size: diff.size,
      points: diff.points,
      tool: "fill",
      target: level.grid,
      rowClues: level.rowClues,
      colClues: level.colClues,
      player: Array.from({ length: diff.size }, () => Array(diff.size).fill(0))
    };
    renderNono();
  }

  function renderNono() {
    const game = state.activeGame;
    const panel = byId("gamePanel");
    const size = game.size;
    const cell = Math.max(24, Math.min(38, Math.floor((Math.min(window.innerWidth, 720) - 120) / size)));
    panel.style.setProperty("--cell-size", `${cell}px`);
    panel.innerHTML = "";
    panel.appendChild(toolbar([
      { id: "nonoFill", label: "채우기", onClick: () => setNonoTool("fill") },
      { id: "nonoMark", label: "표시", onClick: () => setNonoTool("mark") },
      { label: "포기", className: "warning", onClick: consumeTicketAndQuit }
    ]));
    const wrap = document.createElement("div");
    wrap.className = "board-wrap";
    const layout = document.createElement("div");
    layout.className = "nono-layout";
    const corner = document.createElement("div");
    const top = document.createElement("div");
    top.className = "nono-clues-top";
    top.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
    game.colClues.forEach((clues) => {
      const el = document.createElement("div");
      el.className = "clue-col";
      el.innerHTML = clues.map((n) => `<span>${n}</span>`).join("");
      top.appendChild(el);
    });
    const left = document.createElement("div");
    left.className = "nono-clues-left";
    left.style.gridTemplateRows = `repeat(${size}, var(--cell-size))`;
    game.rowClues.forEach((clues) => {
      const el = document.createElement("div");
      el.className = "clue-row";
      el.innerHTML = clues.map((n) => `<span>${n}</span>`).join("");
      left.appendChild(el);
    });
    const board = document.createElement("div");
    board.className = "nono-board";
    board.style.gridTemplateColumns = `repeat(${size}, var(--cell-size))`;
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        const cellEl = document.createElement("button");
        cellEl.type = "button";
        cellEl.className = "nono-cell";
        if (game.player[r][c] === 1) cellEl.classList.add("filled");
        if (game.player[r][c] === 2) cellEl.classList.add("marked");
        cellEl.addEventListener("click", () => clickNono(r, c));
        cellEl.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          game.player[r][c] = game.player[r][c] === 2 ? 0 : 2;
          renderNono();
        });
        board.appendChild(cellEl);
      }
    }
    layout.append(corner, top, left, board);
    wrap.appendChild(layout);
    panel.appendChild(wrap);
    updateNonoTools();
    updateNonoClues();
  }

  function setNonoTool(tool) {
    state.activeGame.tool = tool;
    updateNonoTools();
  }

  function updateNonoTools() {
    byId("nonoFill")?.classList.toggle("active", state.activeGame.tool === "fill");
    byId("nonoMark")?.classList.toggle("active", state.activeGame.tool === "mark");
  }

  function clickNono(r, c) {
    const game = state.activeGame;
    const next = game.tool === "fill" ? 1 : 2;
    game.player[r][c] = game.player[r][c] === next ? 0 : next;
    renderNono();
    if (isNonoWon()) applyWin("nono", game.points, "네모네모 클리어");
  }

  function updateNonoClues() {
    const game = state.activeGame;
    const rows = $$(".clue-row");
    const cols = $$(".clue-col");
    for (let r = 0; r < game.size; r += 1) {
      rows[r].classList.toggle("clue-done", JSON.stringify(getNonoClues(game.player[r].map((v) => (v === 1 ? 1 : 0)))) === JSON.stringify(game.rowClues[r]));
    }
    for (let c = 0; c < game.size; c += 1) {
      const col = game.player.map((row) => (row[c] === 1 ? 1 : 0));
      cols[c].classList.toggle("clue-done", JSON.stringify(getNonoClues(col)) === JSON.stringify(game.colClues[c]));
    }
  }

  function isNonoWon() {
    const game = state.activeGame;
    for (let r = 0; r < game.size; r += 1) {
      for (let c = 0; c < game.size; c += 1) {
        if (game.target[r][c] !== (game.player[r][c] === 1 ? 1 : 0)) return false;
      }
    }
    return true;
  }

  const DIRS = [
    { bit: 1, dr: -1, dc: 0, opposite: 4, cls: "up" },
    { bit: 2, dr: 0, dc: 1, opposite: 8, cls: "right" },
    { bit: 4, dr: 1, dc: 0, opposite: 1, cls: "down" },
    { bit: 8, dr: 0, dc: -1, opposite: 2, cls: "left" }
  ];

  const randomInt = (max) => Math.floor(Math.random() * max);
  const shuffle = (array) => array.map((value) => [Math.random(), value]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]);
  const cellKey = (r, c) => `${r},${c}`;
  const inBounds = (size, r, c) => r >= 0 && r < size && c >= 0 && c < size;
  const bitCount = (mask) => DIRS.filter((dir) => mask & dir.bit).length;

  function rotateMask(mask, turns) {
    let current = mask;
    for (let i = 0; i < turns; i += 1) {
      let next = 0;
      if (current & 1) next |= 2;
      if (current & 2) next |= 4;
      if (current & 4) next |= 8;
      if (current & 8) next |= 1;
      current = next;
    }
    return current;
  }

  function findPipePath(size, minLen) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const start = { r: randomInt(size), c: 0 };
      const end = { r: randomInt(size), c: size - 1 };
      const visited = new Set([cellKey(start.r, start.c)]);
      const path = [start];
      const search = (r, c) => {
        if (r === end.r && c === end.c && path.length >= minLen) return true;
        if (path.length > size * size - 2) return false;
        const dirs = shuffle(DIRS).sort((a, b) => {
          const da = Math.abs(end.r - (r + a.dr)) + Math.abs(end.c - (c + a.dc)) + Math.random() * 2.4;
          const db = Math.abs(end.r - (r + b.dr)) + Math.abs(end.c - (c + b.dc)) + Math.random() * 2.4;
          return da - db;
        });
        for (const dir of dirs) {
          const nr = r + dir.dr;
          const nc = c + dir.dc;
          const key = cellKey(nr, nc);
          if (!inBounds(size, nr, nc) || visited.has(key)) continue;
          visited.add(key);
          path.push({ r: nr, c: nc });
          if (search(nr, nc)) return true;
          path.pop();
          visited.delete(key);
        }
        return false;
      };
      if (search(start.r, start.c)) return { start, end, path };
    }
    const r = randomInt(size);
    return {
      start: { r, c: 0 },
      end: { r, c: size - 1 },
      path: Array.from({ length: size }, (_, c) => ({ r, c }))
    };
  }

  function connectMasks(masks, a, b) {
    const dr = b.r - a.r;
    const dc = b.c - a.c;
    const dir = DIRS.find((item) => item.dr === dr && item.dc === dc);
    if (!dir) return;
    masks[a.r][a.c] |= dir.bit;
    masks[b.r][b.c] |= dir.opposite;
  }

  function addPipeBranches(masks, size, seeds, count, branchMax) {
    const occupied = () => {
      const list = [];
      for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) if (masks[r][c]) list.push({ r, c });
      return list;
    };
    for (let i = 0; i < count; i += 1) {
      let current = shuffle([...seeds, ...occupied()])[0];
      const length = 1 + randomInt(branchMax);
      for (let step = 0; step < length; step += 1) {
        const options = shuffle(DIRS)
          .map((dir) => ({ r: current.r + dir.dr, c: current.c + dir.dc }))
          .filter((next) => inBounds(size, next.r, next.c) && bitCount(masks[next.r][next.c]) < 3);
        if (!options.length) break;
        const next = options[0];
        connectMasks(masks, current, next);
        current = next;
      }
    }
  }

  function randomPipeMask() {
    const pieces = [1, 2, 4, 8, 3, 6, 12, 9, 5, 10, 7, 11, 13, 14, 15];
    return pieces[randomInt(pieces.length)];
  }

  function generatePipe(diff) {
    const size = diff.size;
    const { start, end, path } = findPipePath(size, diff.minLen);
    const masks = Array.from({ length: size }, () => Array(size).fill(0));
    for (let i = 0; i < path.length - 1; i += 1) connectMasks(masks, path[i], path[i + 1]);
    addPipeBranches(masks, size, path, diff.branches, diff.branchMax);
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (!masks[r][c]) masks[r][c] = randomPipeMask();
      }
    }
    let rotations = Array.from({ length: size }, () => Array.from({ length: size }, () => randomInt(4)));
    for (let tries = 0; tries < 30 && pipeConnected({ size, masks, rotations, start, end }).won; tries += 1) {
      rotations = Array.from({ length: size }, () => Array.from({ length: size }, () => randomInt(4)));
    }
    return { size, masks, rotations, start, end, points: diff.points };
  }

  function pipeConnected(game) {
    const queue = [game.start];
    const visited = new Set([cellKey(game.start.r, game.start.c)]);
    const flow = [];
    while (queue.length) {
      const current = queue.shift();
      flow.push(current);
      const mask = rotateMask(game.masks[current.r][current.c], game.rotations[current.r][current.c]);
      for (const dir of DIRS) {
        if (!(mask & dir.bit)) continue;
        const nr = current.r + dir.dr;
        const nc = current.c + dir.dc;
        if (!inBounds(game.size, nr, nc)) continue;
        const nextMask = rotateMask(game.masks[nr][nc], game.rotations[nr][nc]);
        const key = cellKey(nr, nc);
        if ((nextMask & dir.opposite) && !visited.has(key)) {
          visited.add(key);
          queue.push({ r: nr, c: nc });
        }
      }
    }
    return { won: visited.has(cellKey(game.end.r, game.end.c)), flow };
  }

  function startPipe(diff) {
    state.activeGame = { type: "pipe", ...generatePipe(diff) };
    renderPipe();
  }

  function renderPipe() {
    const game = state.activeGame;
    const panel = byId("gamePanel");
    const result = pipeConnected(game);
    const cell = Math.max(44, Math.min(70, Math.floor((Math.min(window.innerWidth, 700) - 56) / game.size)));
    panel.style.setProperty("--cell-size", `${cell}px`);
    panel.innerHTML = "";
    panel.appendChild(toolbar([
      { label: "물 틀기", onClick: () => checkPipeWin(true) },
      { label: "새로 섞기", onClick: reshufflePipe },
      { label: "포기", className: "warning", onClick: consumeTicketAndQuit }
    ]));
    const wrap = document.createElement("div");
    wrap.className = "board-wrap";
    const board = document.createElement("div");
    board.className = "pipe-board";
    board.style.gridTemplateColumns = `repeat(${game.size}, var(--cell-size))`;
    const flowKeys = new Set(result.flow.map((cellItem) => cellKey(cellItem.r, cellItem.c)));
    for (let r = 0; r < game.size; r += 1) {
      for (let c = 0; c < game.size; c += 1) {
        const cellEl = document.createElement("button");
        cellEl.type = "button";
        cellEl.className = "pipe-cell";
        if (r === game.start.r && c === game.start.c) cellEl.classList.add("start");
        if (r === game.end.r && c === game.end.c) cellEl.classList.add("end");
        if (flowKeys.has(cellKey(r, c))) cellEl.classList.add("flow");
        const mask = rotateMask(game.masks[r][c], game.rotations[r][c]);
        cellEl.innerHTML = `<span class="pipe-center"></span>`;
        DIRS.forEach((dir) => {
          if (mask & dir.bit) cellEl.insertAdjacentHTML("beforeend", `<span class="pipe-arm ${dir.cls}"></span>`);
        });
        if (r === game.start.r && c === game.start.c) cellEl.insertAdjacentHTML("beforeend", `<span class="pipe-label">S</span>`);
        if (r === game.end.r && c === game.end.c) cellEl.insertAdjacentHTML("beforeend", `<span class="pipe-label">E</span>`);
        cellEl.addEventListener("click", () => {
          game.rotations[r][c] = (game.rotations[r][c] + 1) % 4;
          renderPipe();
        });
        board.appendChild(cellEl);
      }
    }
    wrap.appendChild(board);
    panel.appendChild(wrap);
  }

  function reshufflePipe() {
    const game = state.activeGame;
    game.rotations = Array.from({ length: game.size }, () => Array.from({ length: game.size }, () => randomInt(4)));
    renderPipe();
  }

  function checkPipeWin(fromButton) {
    const game = state.activeGame;
    const result = pipeConnected(game);
    renderPipe();
    if (result.won) applyWin("pipe", game.points, "배관 연결 성공");
    else if (fromButton) toast("아직 끝까지 연결되지 않았습니다.");
  }

  function start2048(diff) {
    const grid = Array.from({ length: diff.size }, () => Array(diff.size).fill(0));
    state.activeGame = { type: "g2048", size: diff.size, points: diff.points, grid, boardScore: 0, cleared: false };
    addTile2048();
    addTile2048();
    render2048();
  }

  function addTile2048() {
    const game = state.activeGame;
    const empty = [];
    for (let r = 0; r < game.size; r += 1) for (let c = 0; c < game.size; c += 1) if (!game.grid[r][c]) empty.push({ r, c });
    if (!empty.length) return;
    const pick = empty[randomInt(empty.length)];
    game.grid[pick.r][pick.c] = Math.random() < 0.9 ? 2 : 4;
  }

  function render2048() {
    const game = state.activeGame;
    const panel = byId("gamePanel");
    const cell = Math.max(58, Math.min(86, Math.floor((Math.min(window.innerWidth, 620) - 80) / game.size)));
    panel.style.setProperty("--cell-size", `${cell}px`);
    panel.innerHTML = "";
    const strip = document.createElement("div");
    strip.className = "score-strip";
    strip.innerHTML = `<span>보드 점수 <strong>${game.boardScore.toLocaleString()}</strong></span>`;
    panel.appendChild(strip);
    panel.appendChild(toolbar([
      { label: "다시", onClick: () => start2048(GAME_META.g2048.difficulties.find((d) => d.size === game.size)) },
      { label: "포기", className: "warning", onClick: consumeTicketAndQuit }
    ]));
    const wrap = document.createElement("div");
    wrap.className = "board-wrap";
    const board = document.createElement("div");
    board.className = "board-2048";
    board.style.gridTemplateColumns = `repeat(${game.size}, var(--cell-size))`;
    for (let r = 0; r < game.size; r += 1) {
      for (let c = 0; c < game.size; c += 1) {
        const value = game.grid[r][c];
        const tile = document.createElement("div");
        tile.className = `tile-2048 ${value ? `v${value}` : ""}`;
        tile.textContent = value || "";
        board.appendChild(tile);
      }
    }
    board.addEventListener("touchstart", (event) => {
      const touch = event.changedTouches[0];
      state.touchStart = { x: touch.screenX, y: touch.screenY };
    }, { passive: true });
    board.addEventListener("touchend", (event) => {
      if (!state.touchStart) return;
      const touch = event.changedTouches[0];
      const dx = touch.screenX - state.touchStart.x;
      const dy = touch.screenY - state.touchStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
      operate2048(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    }, { passive: true });
    wrap.appendChild(board);
    panel.appendChild(wrap);
  }

  function slideLine(line, game) {
    const values = line.filter(Boolean);
    for (let i = 0; i < values.length - 1; i += 1) {
      if (values[i] === values[i + 1]) {
        values[i] *= 2;
        game.boardScore += values[i];
        if (values[i] >= 2048 && !game.cleared) {
          game.cleared = true;
          setTimeout(() => applyWin("g2048", game.points, "2048 완성"), 240);
        }
        values.splice(i + 1, 1);
      }
    }
    while (values.length < game.size) values.push(0);
    return values;
  }

  function operate2048(direction) {
    const game = state.activeGame;
    if (!game || game.type !== "g2048" || game.cleared) return;
    const before = JSON.stringify(game.grid);
    if (direction === "left" || direction === "right") {
      for (let r = 0; r < game.size; r += 1) {
        let line = [...game.grid[r]];
        if (direction === "right") line.reverse();
        line = slideLine(line, game);
        if (direction === "right") line.reverse();
        game.grid[r] = line;
      }
    } else {
      for (let c = 0; c < game.size; c += 1) {
        let line = Array.from({ length: game.size }, (_, r) => game.grid[r][c]);
        if (direction === "down") line.reverse();
        line = slideLine(line, game);
        if (direction === "down") line.reverse();
        for (let r = 0; r < game.size; r += 1) game.grid[r][c] = line[r];
      }
    }
    if (before !== JSON.stringify(game.grid) && !game.cleared) {
      addTile2048();
      render2048();
      if (is2048Over()) {
        toast("더 움직일 수 없습니다.");
        setTimeout(returnToDifficulty, 900);
      }
    }
  }

  function is2048Over() {
    const game = state.activeGame;
    for (let r = 0; r < game.size; r += 1) {
      for (let c = 0; c < game.size; c += 1) {
        if (!game.grid[r][c]) return false;
        if (c < game.size - 1 && game.grid[r][c] === game.grid[r][c + 1]) return false;
        if (r < game.size - 1 && game.grid[r][c] === game.grid[r + 1][c]) return false;
      }
    }
    return true;
  }

  function startMine(diff) {
    const grid = Array.from({ length: diff.size * diff.size }, (_, index) => ({
      index,
      mine: false,
      open: false,
      flag: false,
      count: 0
    }));
    state.activeGame = {
      type: "mine",
      size: diff.size,
      mines: diff.mines,
      points: diff.points,
      grid,
      first: true,
      tool: "open"
    };
    renderMine();
  }

  function mineNeighbors(game, index) {
    const row = Math.floor(index / game.size);
    const col = index % game.size;
    const result = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (!dr && !dc) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (inBounds(game.size, nr, nc)) result.push(nr * game.size + nc);
      }
    }
    return result;
  }

  function placeMines(game, firstIndex) {
    const safe = new Set([firstIndex, ...mineNeighbors(game, firstIndex)]);
    let placed = 0;
    while (placed < game.mines) {
      const index = randomInt(game.grid.length);
      if (safe.has(index) || game.grid[index].mine) continue;
      game.grid[index].mine = true;
      placed += 1;
    }
    game.grid.forEach((cell) => {
      if (!cell.mine) cell.count = mineNeighbors(game, cell.index).filter((idx) => game.grid[idx].mine).length;
    });
  }

  function renderMine() {
    const game = state.activeGame;
    const panel = byId("gamePanel");
    const cell = Math.max(24, Math.min(38, Math.floor((Math.min(window.innerWidth, 700) - 70) / game.size)));
    panel.style.setProperty("--cell-size", `${cell}px`);
    const flags = game.grid.filter((cellItem) => cellItem.flag).length;
    panel.innerHTML = "";
    const strip = document.createElement("div");
    strip.className = "score-strip";
    strip.innerHTML = `<span>남은 지뢰 <strong>${game.mines - flags}</strong></span>`;
    panel.appendChild(strip);
    panel.appendChild(toolbar([
      { id: "mineOpen", label: "열기", onClick: () => setMineTool("open") },
      { id: "mineFlag", label: "깃발", onClick: () => setMineTool("flag") },
      { label: "포기", className: "warning", onClick: consumeTicketAndQuit }
    ]));
    const wrap = document.createElement("div");
    wrap.className = "board-wrap";
    const board = document.createElement("div");
    board.className = "mine-board";
    board.style.gridTemplateColumns = `repeat(${game.size}, var(--cell-size))`;
    game.grid.forEach((cellItem) => {
      const cellEl = document.createElement("button");
      cellEl.type = "button";
      cellEl.className = "mine-cell";
      if (cellItem.open) {
        cellEl.classList.add("open");
        if (cellItem.mine) {
          cellEl.classList.add("bomb");
          cellEl.textContent = "●";
        } else if (cellItem.count) {
          cellEl.textContent = cellItem.count;
        }
      } else if (cellItem.flag) {
        cellEl.classList.add("flag");
        cellEl.textContent = "⚑";
      }
      cellEl.addEventListener("click", () => clickMine(cellItem.index, false));
      cellEl.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        clickMine(cellItem.index, true);
      });
      board.appendChild(cellEl);
    });
    wrap.appendChild(board);
    panel.appendChild(wrap);
    byId("mineOpen")?.classList.toggle("active", game.tool === "open");
    byId("mineFlag")?.classList.toggle("active", game.tool === "flag");
  }

  function setMineTool(tool) {
    state.activeGame.tool = tool;
    renderMine();
  }

  function clickMine(index, forceFlag) {
    const game = state.activeGame;
    const cell = game.grid[index];
    const mode = forceFlag ? "flag" : game.tool;
    if (mode === "flag") {
      if (!cell.open) cell.flag = !cell.flag;
      renderMine();
      return;
    }
    if (cell.flag || cell.open) return;
    if (game.first) {
      placeMines(game, index);
      game.first = false;
    }
    if (cell.mine) {
      game.grid.forEach((item) => { if (item.mine) item.open = true; });
      renderMine();
      toast("지뢰를 밟았습니다.");
      setTimeout(returnToDifficulty, 950);
      return;
    }
    openMine(index);
    renderMine();
    if (game.grid.filter((item) => !item.mine).every((item) => item.open)) {
      applyWin("mine", game.points, "지뢰찾기 성공");
    }
  }

  function openMine(index) {
    const game = state.activeGame;
    const cell = game.grid[index];
    if (cell.open || cell.flag) return;
    cell.open = true;
    if (!cell.count) mineNeighbors(game, index).forEach(openMine);
  }

  const init = () => {
    byId("loginForm").addEventListener("submit", handleLogin);
    byId("logoutBtn").addEventListener("click", logout);
    byId("backToHubBtn").addEventListener("click", backToHub);
    byId("refreshRankingBtn").addEventListener("click", async () => {
      showLoading("랭킹 갱신 중");
      try {
        await refreshRanking();
        toast("랭킹 갱신 완료");
      } finally {
        hideLoading();
      }
    });
    $$(".game-card").forEach((button) => button.addEventListener("click", () => openGame(button.dataset.game)));
    document.addEventListener("keydown", (event) => {
      if (!state.activeGame || state.activeGame.type !== "g2048") return;
      const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
      if (map[event.key]) {
        event.preventDefault();
        operate2048(map[event.key]);
      }
    });
    const lastName = localStorage.getItem(storageKey("last_name"));
    if (lastName) byId("studentNameInput").value = lastName;
    if (!CONFIG.apiUrl) byId("loginStatus").textContent = "미리보기 입장코드: seo2class";
  };

  init();
})();

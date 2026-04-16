const CSV_PATH = "./data/personajes.csv";
const GROUPS_PATH = "./data/agrupaciones.json";
const STORAGE_KEY = "roldle-state-v1";
const CHALLENGE_TIMEZONE = "Europe/Madrid";
const BASE_CHALLENGE_DATE = "2026-01-01";
const CELEBRATION_PARTICLE_COUNT = 24;

const state = {
  characters: [],
  similarityGroups: {},
  target: null,
  targetIndex: -1,
  dayOffset: 0,
  guesses: [],
  solved: false,
};

const refs = {
  form: document.querySelector("#guess-form"),
  input: document.querySelector("#guess-input"),
  suggestions: document.querySelector("#character-suggestions"),
  helperText: document.querySelector("#helper-text"),
  challengeDate: document.querySelector("#challenge-date"),
  attemptCounter: document.querySelector("#attempt-counter"),
  statusCard: document.querySelector("#status-card"),
  statusTitle: document.querySelector("#status-title"),
  statusCopy: document.querySelector("#status-copy"),
  resultsBody: document.querySelector("#results-body"),
  nextDayButton: document.querySelector("#next-day-button"),
  resetButton: document.querySelector("#reset-button"),
};

const attributeLabels = {
  race: "Raza",
  characterClass: "Clase",
  sex: "Sexo",
  player: "Jugador",
  campaign: "Partida",
};

const groupingCategoryAliases = {
  race: "race",
  raza: "race",
  characterClass: "characterClass",
  clase: "characterClass",
  sex: "sex",
  sexo: "sex",
  player: "player",
  jugador: "player",
  campaign: "campaign",
  partida: "campaign",
};

bootstrap().catch((error) => {
  console.error(error);
  setHelper("No se pudo cargar el CSV de personajes.");
  setStatus("status-card--warn", "Error cargando datos", "Revisa la consola del navegador para mas detalle.");
});

async function bootstrap() {
  const [csvText, similarityGroups] = await Promise.all([
    fetch(cacheBustedPath(CSV_PATH), { cache: "no-store" }).then((response) => {
      if (!response.ok) {
        throw new Error(`No se pudo cargar ${CSV_PATH}`);
      }
      return response.text();
    }),
    loadSimilarityGroups(),
  ]);

  state.characters = parseCsv(csvText);
  state.similarityGroups = similarityGroups;

  if (!state.characters.length) {
    throw new Error("La base de datos esta vacia.");
  }

  hydrateState();
  selectDailyTarget();
  renderSuggestions();
  renderAttemptCounter();
  renderChallengeDate();
  renderResults();
  renderStatus();
  wireEvents();
  exposeAdminTools();
  setHelper("Busca un personaje de la lista y compara sus pistas con el objetivo oculto.");
}

function wireEvents() {
  refs.form.addEventListener("submit", handleGuess);
  if (refs.nextDayButton) {
    refs.nextDayButton.addEventListener("click", handleAdvanceDay);
  }
  refs.resetButton.addEventListener("click", handleResetRound);
}

function handleGuess(event) {
  event.preventDefault();

  if (state.solved) {
    setHelper("Ya acertaste este reto. Vuelve manana para el siguiente o reinicia la partida.");
    return;
  }

  const rawName = refs.input.value.trim();
  const character = findCharacterByName(rawName);

  if (!character) {
    setHelper("Ese nombre no coincide con ningun personaje del CSV.");
    return;
  }

  if (state.guesses.some((guess) => guess.id === character.id)) {
    setHelper("Ese personaje ya se ha intentado. Prueba con otro.");
    return;
  }

  const wasSolved = state.solved;
  state.guesses.unshift(buildGuess(character, state.target));
  state.solved = character.id === state.target.id;
  persistState();
  refs.input.value = "";
  renderAttemptCounter();
  renderResults();
  renderStatus();

  if (!wasSolved && state.solved) {
    triggerCelebration();
  }

  setHelper(state.solved
    ? `Has acertado: ${character.name}. El siguiente reto aparecera a las 00:00 de Madrid.`
    : `Intento registrado para ${character.name}. Sigue buscando.`);
}

function handleAdvanceDay() {
  state.dayOffset += 1;
  syncChallengeState();
  setHelper("Se ha cargado un nuevo personaje objetivo.");
}

function handleResetRound() {
  state.guesses = [];
  state.solved = false;
  persistState();
  renderAttemptCounter();
  renderResults();
  renderStatus();
  setHelper("Partida reiniciada. El personaje objetivo sigue siendo el mismo.");
}

function selectDailyTarget() {
  const index = getDailyIndex(state.characters.length, state.dayOffset);
  state.targetIndex = index;
  state.target = state.characters[index];
}

function getDailyIndex(totalCharacters, manualOffset) {
  const diffDays = getDayDifference(BASE_CHALLENGE_DATE, getCurrentChallengeKey(manualOffset));
  const positiveIndex = ((diffDays % totalCharacters) + totalCharacters) % totalCharacters;
  return positiveIndex;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());

  return lines.slice(1)
    .filter(Boolean)
    .map((line, rowIndex) => {
      const values = splitCsvLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, (values[index] || "").trim()]));

      return {
        id: record.id || `character-${rowIndex + 1}`,
        name: record.nombre,
        race: record.raza,
        characterClass: record.clase,
        sex: record.sexo,
        player: record.jugador,
        campaign: record.partida,
      };
    })
    .filter((character) => character.name);
}

function splitCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function renderSuggestions() {
  refs.suggestions.innerHTML = "";

  state.characters
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name, "es"))
    .forEach((character) => {
      const option = document.createElement("option");
      option.value = character.name;
      refs.suggestions.append(option);
    });
}

function renderChallengeDate() {
  refs.challengeDate.textContent = formatChallengeDate(getCurrentChallengeKey(state.dayOffset));
}

function renderAttemptCounter() {
  refs.attemptCounter.textContent = String(state.guesses.length);
}

function renderStatus() {
  if (!refs.statusCard || !refs.statusTitle || !refs.statusCopy) {
    return;
  }

  if (state.solved) {
    setStatus(
      "status-card--win",
      "Personaje descubierto",
      `Has encontrado a ${state.target.name} en ${state.guesses.length} intento${state.guesses.length === 1 ? "" : "s"}.`
    );
    return;
  }

  if (state.guesses.length > 0) {
    setStatus(
      "status-card--warn",
      "Vas bien encaminado",
      "Cada intento muestra que atributos coinciden con el personaje secreto. Sigue afinando."
    );
    return;
  }

  setStatus(
    "status-card--neutral",
    "La mesa esta lista",
    "Escribe un nombre del autocompletado para empezar a comparar pistas."
  );
}

function setStatus(cardClass, title, copy) {
  if (!refs.statusCard || !refs.statusTitle || !refs.statusCopy) {
    return;
  }

  refs.statusCard.className = `status-card ${cardClass}`;
  refs.statusTitle.textContent = title;
  refs.statusCopy.textContent = copy;
}

function renderResults() {
  refs.resultsBody.innerHTML = "";

  if (!state.guesses.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Aun no hay intentos. El primero siempre da pistas.";
    refs.resultsBody.append(empty);
    return;
  }

  state.guesses.forEach((guess) => {
    const row = document.createElement("article");
    row.className = "result-row";
    const nameClass = guess.id === state.target.id
      ? "result-cell result-cell--match"
      : "result-cell result-cell--name";
    row.appendChild(createCell("Nombre", guess.name, nameClass));

    Object.entries(attributeLabels).forEach(([key, label]) => {
      const className = `result-cell ${getResultCellClass(guess.matches[key])}`;
      row.appendChild(createCell(label, guess[key], className));
    });

    refs.resultsBody.append(row);
  });
}

function createCell(label, value, className) {
  const cell = document.createElement("div");
  cell.className = className;

  const labelSpan = document.createElement("span");
  labelSpan.className = "result-cell__label";
  labelSpan.textContent = label;

  const valueSpan = document.createElement("strong");
  valueSpan.textContent = value;

  cell.append(labelSpan, valueSpan);
  return cell;
}

function buildGuess(character, target) {
  const classMatch = compareClasses(character.characterClass, target.characterClass);

  return {
    id: character.id,
    name: character.name,
    race: character.race,
    characterClass: character.characterClass,
    sex: character.sex,
    player: character.player,
    campaign: character.campaign,
    matches: {
      race: compareSingleValue(character.race, target.race, "race"),
      characterClass: classMatch,
      sex: compareSingleValue(character.sex, target.sex, "sex"),
      player: compareSingleValue(character.player, target.player, "player"),
      campaign: compareSingleValue(character.campaign, target.campaign, "campaign"),
    },
  };
}

function getResultCellClass(matchState) {
  if (matchState === "exact") {
    return "result-cell--match";
  }

  if (matchState === "partial") {
    return "result-cell--partial";
  }

  return "result-cell--miss";
}

function compareSingleValue(left, right, category) {
  if (normalized(left) === normalized(right)) {
    return "exact";
  }

  return areGroupedAsSimilar(left, right, category) ? "partial" : "miss";
}

function compareClasses(guessClasses, targetClasses) {
  const guessList = tokenizeClasses(guessClasses);
  const targetList = tokenizeClasses(targetClasses);
  const sortedGuessList = [...guessList].sort();
  const sortedTargetList = [...targetList].sort();

  if (!guessList.length || !targetList.length) {
    return "miss";
  }

  if (
    sortedGuessList.length === sortedTargetList.length &&
    sortedGuessList.every((value, index) => value === sortedTargetList[index])
  ) {
    return "exact";
  }

  const sharedClasses = guessList.filter((value) => targetList.includes(value));

  if (sharedClasses.length > 0) {
    return "partial";
  }

  const groupedClassMatch = guessList.some((guessClass) =>
    targetList.some((targetClass) => areGroupedAsSimilar(guessClass, targetClass, "characterClass"))
  );

  if (groupedClassMatch) {
    return "partial";
  }

  return "miss";
}

function tokenizeClasses(value) {
  return String(value || "")
    .split("/")
    .map((entry) => normalized(entry))
    .filter(Boolean);
}

function findCharacterByName(name) {
  const targetName = normalized(name);
  return state.characters.find((character) => normalized(character.name) === targetName) || null;
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

async function loadSimilarityGroups() {
  try {
    const response = await fetch(cacheBustedPath(GROUPS_PATH), { cache: "no-store" });

    if (!response.ok) {
      return {};
    }

    return normalizeSimilarityGroups(await response.json());
  } catch (error) {
    console.warn("No se pudieron cargar las agrupaciones de similitud.", error);
    return {};
  }
}

function normalizeSimilarityGroups(groups) {
  const normalizedGroups = {};

  Object.entries(groups || {}).forEach(([rawCategory, entries]) => {
    const category = groupingCategoryAliases[rawCategory] || rawCategory;
    const parsedEntries = Array.isArray(entries)
      ? entries
          .filter(Array.isArray)
          .map((group) => group.map((value) => normalized(value)).filter(Boolean))
          .filter((group) => group.length >= 2)
      : [];

    normalizedGroups[category] = [...(normalizedGroups[category] || []), ...parsedEntries];
  });

  return normalizedGroups;
}

function areGroupedAsSimilar(left, right, category) {
  const normalizedLeft = normalized(left);
  const normalizedRight = normalized(right);
  const groups = state.similarityGroups[category] || [];

  return groups.some((group) => group.includes(normalizedLeft) && group.includes(normalizedRight));
}

function setHelper(message) {
  refs.helperText.textContent = message;
}

function hydrateState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const saved = JSON.parse(raw);
    if (typeof saved.dayOffset === "number") {
      state.dayOffset = saved.dayOffset;
    }

    if (saved.challengeKey === getCurrentChallengeKey(state.dayOffset) && Array.isArray(saved.guesses)) {
      state.guesses = saved.guesses;
    }

    if (saved.challengeKey === getCurrentChallengeKey(state.dayOffset) && typeof saved.solved === "boolean") {
      state.solved = saved.solved;
    }
  } catch (error) {
    console.warn("No se pudo recuperar la partida guardada.", error);
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      dayOffset: state.dayOffset,
      challengeKey: getCurrentChallengeKey(state.dayOffset),
      guesses: state.guesses,
      solved: state.solved,
    })
  );
}

function syncChallengeState() {
  state.guesses = [];
  state.solved = false;
  selectDailyTarget();
  persistState();
  renderChallengeDate();
  renderAttemptCounter();
  renderResults();
  renderStatus();
}

function getCurrentChallengeKey(offsetDays = 0) {
  const madridParts = getTimeZoneDateParts(new Date(), CHALLENGE_TIMEZONE);
  const shiftedDate = new Date(Date.UTC(
    madridParts.year,
    madridParts.month - 1,
    madridParts.day + offsetDays
  ));

  return [
    shiftedDate.getUTCFullYear(),
    String(shiftedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(shiftedDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getTimeZoneDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function cacheBustedPath(path) {
  return `${path}?v=${Date.now()}`;
}

function getDayDifference(baseKey, targetKey) {
  return Math.floor((dateKeyToUtc(targetKey) - dateKeyToUtc(baseKey)) / 86400000);
}

function dateKeyToUtc(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function formatChallengeDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "UTC",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function exposeAdminTools() {
  window.roldleAdmin = {
    getCurrentTarget() {
      return {
        challengeDate: getCurrentChallengeKey(state.dayOffset),
        localOverrideDays: state.dayOffset,
        target: state.target ? { ...state.target } : null,
      };
    },
    advanceDay(days = 1) {
      const parsedDays = Number(days);
      state.dayOffset += Number.isFinite(parsedDays) ? parsedDays : 1;
      syncChallengeState();
      setHelper("Has adelantado tu reto localmente desde la consola.");
      return this.getCurrentTarget();
    },
    clearOverride() {
      state.dayOffset = 0;
      syncChallengeState();
      setHelper("Has vuelto al reto diario real.");
      return this.getCurrentTarget();
    },
    getChallengeDate() {
      return getCurrentChallengeKey(state.dayOffset);
    },
  };
}

function triggerCelebration() {
  const existingLayer = document.querySelector(".celebration-layer");
  if (existingLayer) {
    existingLayer.remove();
  }

  const layer = document.createElement("div");
  layer.className = "celebration-layer";
  layer.setAttribute("aria-hidden", "true");

  for (let index = 0; index < CELEBRATION_PARTICLE_COUNT; index += 1) {
    const particle = document.createElement("span");
    particle.className = "celebration-particle";
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 0.18}s`;
    particle.style.animationDuration = `${1.9 + Math.random() * 1.3}s`;
    particle.style.setProperty("--drift", `${-90 + Math.random() * 180}px`);
    particle.style.setProperty("--rotation", `${120 + Math.random() * 300}deg`);
    particle.style.setProperty("--particle-color", getCelebrationColor(index));
    layer.appendChild(particle);
  }

  const burst = document.createElement("div");
  burst.className = "celebration-burst";
  layer.appendChild(burst);

  document.body.appendChild(layer);
  window.setTimeout(() => {
    layer.classList.add("celebration-layer--fade");
  }, 1400);
  window.setTimeout(() => {
    layer.remove();
  }, 2800);
}

function getCelebrationColor(index) {
  const colors = [
    "#d9b35f",
    "#f3e2a1",
    "#b43c2f",
    "#6f8a52",
  ];

  return colors[index % colors.length];
}

const CSV_PATH = "./data/personajes.csv";
const GROUPS_PATH = "./data/agrupaciones.json";
const STORAGE_KEY = "roldle-state-v1";

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
    fetch(CSV_PATH).then((response) => {
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
  setHelper("Busca un personaje de la lista y compara sus pistas con el objetivo oculto.");
}

function wireEvents() {
  refs.form.addEventListener("submit", handleGuess);
  refs.nextDayButton.addEventListener("click", handleAdvanceDay);
  refs.resetButton.addEventListener("click", handleResetRound);
}

function handleGuess(event) {
  event.preventDefault();

  if (state.solved) {
    setHelper("Ya acertaste este reto. Pulsa \"Pasar al siguiente\" o reinicia la partida.");
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

  state.guesses.unshift(buildGuess(character, state.target));
  state.solved = character.id === state.target.id;
  persistState();
  refs.input.value = "";
  renderAttemptCounter();
  renderResults();
  renderStatus();
  setHelper(state.solved
    ? `Has acertado: ${character.name}. Puedes pasar al siguiente reto cuando quieras.`
    : `Intento registrado para ${character.name}. Sigue buscando.`);
}

function handleAdvanceDay() {
  state.dayOffset += 1;
  state.guesses = [];
  state.solved = false;
  selectDailyTarget();
  persistState();
  renderChallengeDate();
  renderAttemptCounter();
  renderResults();
  renderStatus();
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
  const baseDate = new Date("2026-01-01T00:00:00");
  const today = new Date();
  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = todayKey.getTime() - baseDate.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const positiveIndex = ((diffDays + manualOffset) % totalCharacters + totalCharacters) % totalCharacters;
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
  const today = new Date();
  const visualDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  visualDate.setDate(visualDate.getDate() + state.dayOffset);
  refs.challengeDate.textContent = visualDate.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function renderAttemptCounter() {
  refs.attemptCounter.textContent = String(state.guesses.length);
}

function renderStatus() {
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
    const response = await fetch(GROUPS_PATH);

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

    if (Array.isArray(saved.guesses)) {
      state.guesses = saved.guesses;
    }

    if (typeof saved.solved === "boolean") {
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
      guesses: state.guesses,
      solved: state.solved,
    })
  );
}

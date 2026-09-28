import { useEffect, useMemo, useRef, useState } from "react";
import { hasSupabase, supabase } from "./lib/supabase";

const navItems = [
  ["overview", "Visão geral", "overview"],
  ["agenda", "Agenda", "calendar"],
  ["tasks", "Tarefas", "tasks"],
  ["notes", "Notas", "notes"],
  ["study", "Estudos", "study"],
  ["routine", "Rotina", "routine"],
  ["nutrition", "Alimentação", "nutrition"],
  ["workouts", "Treinos", "workouts"],
  ["alerts", "Alertas", "alerts"],
  ["account", "Conta", "account"],
];
const colors = ["#0c7b72", "#267aa0", "#d17a39", "#bd5f70", "#708d4b"];
const newId = () =>
  `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const pad = (value) => String(value).padStart(2, "0");
const capitalize = (value) =>
  value
    ? `${value.charAt(0).toLocaleUpperCase("pt-BR")}${value.slice(1)}`
    : value;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dateInput = (value) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeInput = (value) => {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const niceDate = (value, withTime = false) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
const weekday = (value) =>
  capitalize(
    new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
      .format(new Date(value))
      .replace(".", ""),
  );
const isToday = (value) => dateInput(value) === today();
const toIso = (date, time) =>
  new Date(`${date}T${time || "09:00"}:00`).toISOString();
const dateKey = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const addMonthsPreservingDay = (date, months, preferredDay = date.getDate()) => {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(preferredDay, lastDay));
  return next;
};
const recurrenceCopy = {
  daily: "Todos os dias",
  weekdays: "Nos dias úteis",
  weekly: "Toda semana",
  monthly: "Todo mês",
};
function generateEventOccurrences(form) {
  if (form.recurrence === "none") return [form];
  if (!form.recurrenceUntil)
    throw new Error("Escolha até quando o compromisso deve se repetir.");
  if (form.recurrenceUntil < form.date)
    throw new Error("A data final precisa ser igual ou posterior à primeira data.");

  const until = new Date(`${form.recurrenceUntil}T12:00:00`);
  let cursor = new Date(`${form.date}T12:00:00`);
  const monthlyDay = cursor.getDate();
  const occurrences = [];
  while (cursor <= until) {
    if (form.recurrence !== "weekdays" || ![0, 6].includes(cursor.getDay())) {
      occurrences.push({ ...form, date: dateKey(cursor) });
    }
    if (occurrences.length > 180)
      throw new Error("Escolha um período de até 180 ocorrências por vez.");
    if (form.recurrence === "daily" || form.recurrence === "weekdays") {
      cursor.setDate(cursor.getDate() + 1);
    } else if (form.recurrence === "weekly") {
      cursor.setDate(cursor.getDate() + 7);
    } else {
      cursor = addMonthsPreservingDay(cursor, 1, monthlyDay);
    }
  }
  if (!occurrences.length)
    throw new Error("Não há dias úteis dentro do período escolhido.");
  return occurrences;
}
const safeJson = (value, fallback = []) =>
  Array.isArray(value) ? value : fallback;
const formatTimer = (seconds) =>
  `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const elapsedTaskSeconds = (task, currentTime = Date.now()) => {
  const saved = Number(task.timerElapsedSeconds || 0);
  if (!task.timerStartedAt) return saved;
  return (
    saved +
    Math.max(
      0,
      Math.floor(
        (currentTime - new Date(task.timerStartedAt).getTime()) / 1000,
      ),
    )
  );
};
const camelCase = (value) =>
  value.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
const safeExternalUrl = (value) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const safeFileName = (name) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-100);
const attachmentTypeFor = (file) => {
  if (file.type.startsWith("image/")) return "imagem";
  if (file.type === "application/pdf") return "certificado";
  return "arquivo";
};

const emptyData = (user) => ({
  profile: {
    displayName: user?.email?.split("@")[0] || "Minha conta",
    emailAlerts: false,
    smsAlerts: false,
    phone: "",
    mfaRequired: false,
    dailyWaterGoal: 2000,
  },
  events: [],
  tasks: [],
  notes: [],
  subjects: [],
  studySessions: [],
  studyPaths: [],
  studyTopics: [],
  attachments: [],
  habits: [],
  meals: [],
  hydration: [],
  workouts: [],
  workoutSessions: [],
});

function useAuth() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!hasSupabase);

  useEffect(() => {
    if (!hasSupabase) {
      localStorage.removeItem("moletas-demo-data");
      return undefined;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setReady(true);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    user: session?.user || null,
    ready,
    configured: hasSupabase,
    signIn: (email, password) =>
      hasSupabase
        ? supabase.auth.signInWithPassword({ email, password })
        : Promise.resolve({
            error: new Error("Conecte o Supabase para entrar na sua conta."),
          }),
    signUp: (email, password) =>
      hasSupabase
        ? supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin },
          })
        : Promise.resolve({
            error: new Error("Conecte o Supabase para criar uma conta."),
          }),
    resetPassword: (email) =>
      hasSupabase
        ? supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          })
        : Promise.resolve({
            error: new Error("Conecte o Supabase para recuperar a senha."),
          }),
    signOut: () => {
      if (hasSupabase) return supabase.auth.signOut();
      localStorage.removeItem("moletas-demo-data");
      return Promise.resolve();
    },
  };
}

const fromEvent = (row) => ({
  id: row.id,
  title: row.title,
  startsAt: row.starts_at,
  category: row.category,
  reminderMinutes: row.reminder_minutes,
  notes: row.notes || "",
});
const fromTask = (row) => ({
  id: row.id,
  title: row.title,
  dueDate: row.due_date,
  category: row.category,
  priority: row.is_priority,
  completedAt: row.completed_at,
  durationMinutes: Number(row.duration_minutes || 0),
  timerStartedAt: row.timer_started_at || null,
  timerElapsedSeconds: Number(row.timer_elapsed_seconds || 0),
});
const fromNote = (row) => ({
  id: row.id,
  title: row.title,
  content: row.content || "",
  pinned: Boolean(row.is_pinned),
  updatedAt: row.updated_at || row.created_at,
});
const fromSubject = (row) => ({
  id: row.id,
  name: row.name,
  color: row.color,
  targetMinutes: row.weekly_target_minutes,
});
const fromAttachment = (row) => ({
  id: row.id,
  subjectId: row.subject_id,
  title: row.title,
  type: row.type,
  url: row.url || "",
  storagePath: row.storage_path || "",
  mimeType: row.mime_type || "",
  sizeBytes: Number(row.size_bytes || 0),
  createdAt: row.created_at,
});
const fromStudy = (row) => ({
  id: row.id,
  subjectId: row.subject_id,
  startedAt: row.started_at,
  minutes: row.minutes,
  notes: row.notes || "",
});
const fromStudyPath = (row) => ({
  id: row.id,
  subjectId: row.subject_id || null,
  title: row.title,
  description: row.description || "",
});
const fromStudyTopic = (row) => ({
  id: row.id,
  pathId: row.path_id,
  title: row.title,
  resourceUrl: row.resource_url || "",
  notes: row.notes || "",
  position: Number(row.position || 0),
  completedAt: row.completed_at || null,
});
const fromHabit = (row) => ({
  id: row.id,
  name: row.name,
  frequency: safeJson(row.frequency),
  target: row.target,
  completedDates: safeJson(row.completed_dates),
});
const fromWorkout = (row) => ({
  id: row.id,
  name: row.name,
  focus: row.focus,
  bodyPart: row.body_part || row.focus,
  duration: row.duration_minutes,
  days: safeJson(row.days),
});
const fromWorkoutSession = (row) => ({
  id: row.id,
  workoutId: row.workout_id,
  completedAt: row.completed_at,
});
const fromMeal = (row) => ({
  id: row.id,
  title: row.title,
  date: row.meal_date,
  type: row.meal_type,
  time: row.planned_time ? row.planned_time.slice(0, 5) : "",
  notes: row.notes || "",
  completedAt: row.completed_at || null,
});
const fromHydration = (row) => ({
  id: row.id,
  date: row.entry_date,
  amountMl: Number(row.amount_ml || 0),
});

function usePlanner(user, isDemo) {
  const [data, setData] = useState(() => emptyData(user));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);

  const storeDemo = (next) => {
    setData(next);
    localStorage.setItem("moletas-demo-data", JSON.stringify(next));
  };
  const localMutation = (fn) => storeDemo(fn(data));

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      if (isDemo) {
        try {
          const cached = JSON.parse(localStorage.getItem("moletas-demo-data"));
          if (cached?.profile && active) {
            const fallback = emptyData(user);
            setData({
              ...fallback,
              ...cached,
              attachments: cached.attachments || fallback.attachments,
            });
          }
        } catch {
          /* início limpo */
        }
        if (active) setLoading(false);
        return;
      }
      const queries = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("calendar_events").select("*").order("starts_at"),
        supabase.from("tasks").select("*").order("created_at"),
        supabase
          .from("notes")
          .select("*")
          .order("is_pinned", { ascending: false })
          .order("updated_at", { ascending: false }),
        supabase.from("study_subjects").select("*").order("created_at"),
        supabase
          .from("study_sessions")
          .select("*")
          .order("started_at", { ascending: false }),
        supabase.from("study_paths").select("*").order("created_at"),
        supabase
          .from("study_topics")
          .select("*")
          .order("position")
          .order("created_at"),
        supabase.from("study_attachments").select("*").order("created_at"),
        supabase.from("habits").select("*").order("created_at"),
        supabase
          .from("meal_entries")
          .select("*")
          .order("meal_date")
          .order("planned_time"),
        supabase.from("hydration_logs").select("*").order("entry_date"),
        supabase.from("workouts").select("*").order("created_at"),
        supabase
          .from("workout_sessions")
          .select("*")
          .order("completed_at", { ascending: false }),
      ]);
      const failure = queries.find((result) => result.error)?.error;
      if (failure) {
        if (active) {
          setError(
            "Não foi possível carregar seus dados. Confira a configuração do Supabase.",
          );
          setLoading(false);
        }
        return;
      }
      const [
        profile,
        events,
        tasks,
        notes,
        subjects,
        studySessions,
        studyPaths,
        studyTopics,
        attachments,
        habits,
        meals,
        hydration,
        workouts,
        workoutSessions,
      ] = queries.map((result) => result.data);
      if (!profile)
        await supabase
          .from("profiles")
          .upsert({ id: user.id, display_name: user.email.split("@")[0] });
      if (active) {
        setData({
          profile: {
            displayName: profile?.display_name || user.email.split("@")[0],
            emailAlerts: profile?.email_notifications || false,
            smsAlerts: profile?.sms_notifications || false,
            phone: profile?.phone || "",
            mfaRequired: profile?.mfa_required || false,
            dailyWaterGoal: Number(profile?.daily_water_goal_ml || 2000),
          },
          events: events.map(fromEvent),
          tasks: tasks.map(fromTask),
          notes: notes.map(fromNote),
          subjects: subjects.map(fromSubject),
          studySessions: studySessions.map(fromStudy),
          studyPaths: studyPaths.map(fromStudyPath),
          studyTopics: studyTopics.map(fromStudyTopic),
          attachments: attachments.map(fromAttachment),
          habits: habits.map(fromHabit),
          meals: meals.map(fromMeal),
          hydration: hydration.map(fromHydration),
          workouts: workouts.map(fromWorkout),
          workoutSessions: workoutSessions.map(fromWorkoutSession),
        });
        setLoading(false);
      }
    }
    if (user) load();
    return () => {
      active = false;
    };
  }, [user?.id, isDemo]);

  async function remote(action) {
    setSyncing(true);
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError(reason.message || "Não foi possível salvar a alteração.");
      return null;
    } finally {
      setSyncing(false);
    }
  }
  async function insert(table, payload, mapper, key) {
    if (isDemo) {
      const timestamp = new Date().toISOString();
      const row = mapper({
        id: newId(),
        ...payload,
        created_at: timestamp,
        updated_at: timestamp,
      });
      localMutation((state) => ({ ...state, [key]: [...state[key], row] }));
      return row;
    }
    return remote(async () => {
      const { data: row, error: issue } = await supabase
        .from(table)
        .insert({ ...payload, user_id: user.id })
        .select()
        .single();
      if (issue) throw issue;
      const mapped = mapper(row);
      setData((state) => ({ ...state, [key]: [...state[key], mapped] }));
      return mapped;
    });
  }
  async function insertMany(table, payloads, mapper, key) {
    if (!payloads.length) return [];
    if (isDemo) {
      const timestamp = new Date().toISOString();
      const rows = payloads.map((payload) =>
        mapper({
          id: newId(),
          ...payload,
          created_at: timestamp,
          updated_at: timestamp,
        }),
      );
      localMutation((state) => ({ ...state, [key]: [...state[key], ...rows] }));
      return rows;
    }
    return remote(async () => {
      const { data: rows, error: issue } = await supabase
        .from(table)
        .insert(payloads.map((payload) => ({ ...payload, user_id: user.id })))
        .select();
      if (issue) throw issue;
      const mapped = rows.map(mapper);
      setData((state) => ({ ...state, [key]: [...state[key], ...mapped] }));
      return mapped;
    });
  }
  async function update(table, id, payload, mapper, key) {
    if (isDemo) {
      const localPayload = Object.fromEntries(
        Object.entries(payload).map(([field, value]) => [
          camelCase(field),
          value,
        ]),
      );
      if (table === "tasks" && "isPriority" in localPayload) {
        localPayload.priority = localPayload.isPriority;
        delete localPayload.isPriority;
      }
      if (table === "notes" && "isPinned" in localPayload) {
        localPayload.pinned = localPayload.isPinned;
        localPayload.updatedAt = new Date().toISOString();
        delete localPayload.isPinned;
      }
      if (table === "study_subjects" && "weeklyTargetMinutes" in localPayload) {
        localPayload.targetMinutes = localPayload.weeklyTargetMinutes;
        delete localPayload.weeklyTargetMinutes;
      }
      if (table === "workouts" && "durationMinutes" in localPayload) {
        localPayload.duration = localPayload.durationMinutes;
        delete localPayload.durationMinutes;
      }
      localMutation((state) => ({
        ...state,
        [key]: state[key].map((item) =>
          item.id === id ? { ...item, ...localPayload } : item,
        ),
      }));
      return;
    }
    return remote(async () => {
      const { data: row, error: issue } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (issue) throw issue;
      const mapped = mapper(row);
      setData((state) => ({
        ...state,
        [key]: state[key].map((item) => (item.id === id ? mapped : item)),
      }));
    });
  }
  async function remove(table, id, key) {
    if (isDemo) {
      localMutation((state) => ({
        ...state,
        [key]: state[key].filter((item) => item.id !== id),
      }));
      return;
    }
    return remote(async () => {
      const { error: issue } = await supabase.from(table).delete().eq("id", id);
      if (issue) throw issue;
      setData((state) => ({
        ...state,
        [key]: state[key].filter((item) => item.id !== id),
      }));
    });
  }

  return {
    data,
    loading,
    error,
    syncing,
    addEvent: (form) =>
      insert(
        "calendar_events",
        {
          title: form.title,
          starts_at: toIso(form.date, form.time),
          category: form.category,
          reminder_minutes: Number(form.reminderMinutes),
          notes: form.notes || "",
        },
        fromEvent,
        "events",
      ),
    addEvents: (forms) =>
      insertMany(
        "calendar_events",
        forms.map((form) => ({
          title: form.title,
          starts_at: toIso(form.date, form.time),
          category: form.category,
          reminder_minutes: Number(form.reminderMinutes),
          notes: form.notes || "",
        })),
        fromEvent,
        "events",
      ),
    updateEvent: (id, form) =>
      update(
        "calendar_events",
        id,
        {
          title: form.title,
          starts_at: toIso(form.date, form.time),
          category: form.category,
          reminder_minutes: Number(form.reminderMinutes),
          notes: form.notes || "",
        },
        fromEvent,
        "events",
      ),
    addTask: (form) =>
      insert(
        "tasks",
        {
          title: form.title,
          due_date: form.dueDate || null,
          category: form.category,
          is_priority: form.priority,
          completed_at: null,
          duration_minutes: form.durationMinutes
            ? Number(form.durationMinutes)
            : null,
          timer_started_at: null,
          timer_elapsed_seconds: 0,
        },
        fromTask,
        "tasks",
      ),
    updateTaskDetails: (id, form) =>
      update(
        "tasks",
        id,
        {
          title: form.title,
          due_date: form.dueDate || null,
          category: form.category,
          is_priority: form.priority,
          duration_minutes: form.durationMinutes
            ? Number(form.durationMinutes)
            : null,
          timer_started_at: null,
          timer_elapsed_seconds: 0,
        },
        fromTask,
        "tasks",
      ),
    addNote: (form) =>
      insert(
        "notes",
        {
          title: form.title,
          content: form.content || "",
          is_pinned: Boolean(form.pinned),
        },
        fromNote,
        "notes",
      ),
    updateNote: (id, form) =>
      update(
        "notes",
        id,
        {
          title: form.title,
          content: form.content || "",
          is_pinned: Boolean(form.pinned),
        },
        fromNote,
        "notes",
      ),
    toggleTask: (task) =>
      update(
        "tasks",
        task.id,
        task.completedAt
          ? { completed_at: null }
          : { completed_at: new Date().toISOString(), timer_started_at: null },
        fromTask,
        "tasks",
      ),
    startTaskTimer: (task) =>
      update(
        "tasks",
        task.id,
        { timer_started_at: new Date().toISOString() },
        fromTask,
        "tasks",
      ),
    pauseTaskTimer: (task) =>
      update(
        "tasks",
        task.id,
        {
          timer_started_at: null,
          timer_elapsed_seconds: elapsedTaskSeconds(task),
        },
        fromTask,
        "tasks",
      ),
    resetTaskTimer: (task) =>
      update(
        "tasks",
        task.id,
        { timer_started_at: null, timer_elapsed_seconds: 0 },
        fromTask,
        "tasks",
      ),
    finishTaskTimer: (task) =>
      update(
        "tasks",
        task.id,
        {
          completed_at: new Date().toISOString(),
          timer_started_at: null,
          timer_elapsed_seconds: Math.min(
            Number(task.durationMinutes || 0) * 60,
            elapsedTaskSeconds(task),
          ),
        },
        fromTask,
        "tasks",
      ),
    addSubject: (form) =>
      insert(
        "study_subjects",
        {
          name: form.name,
          color: form.color,
          weekly_target_minutes: Number(form.targetMinutes),
        },
        fromSubject,
        "subjects",
      ),
    updateSubject: (id, form) =>
      update(
        "study_subjects",
        id,
        {
          name: form.name,
          color: form.color,
          weekly_target_minutes: Number(form.targetMinutes),
        },
        fromSubject,
        "subjects",
      ),
    addStudyLink: (subjectId, form) => {
      const url = safeExternalUrl(form.url);
      if (!url) {
        setError("Informe um link HTTP ou HTTPS válido.");
        return Promise.resolve(null);
      }
      return insert(
        "study_attachments",
        {
          subject_id: subjectId,
          title: form.title.trim() || new URL(url).hostname,
          type: "link",
          url,
          storage_path: null,
          mime_type: null,
          size_bytes: null,
        },
        fromAttachment,
        "attachments",
      );
    },
    uploadStudyAttachment: async (subjectId, file) => {
      if (!file) return null;
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.type)) {
        setError("Envie um PDF, JPG, PNG ou WEBP de até 10 MB.");
        return null;
      }
      if (file.size > 10 * 1024 * 1024) {
        setError("O arquivo deve ter no máximo 10 MB.");
        return null;
      }
      if (isDemo) {
        setError("Conecte o Supabase para guardar arquivos privados.");
        return null;
      }
      return remote(async () => {
        const token = crypto.randomUUID?.() || newId();
        const path = `${user.id}/${subjectId}/${token}-${safeFileName(file.name)}`;
        const { error: uploadIssue } = await supabase.storage
          .from("study-files")
          .upload(path, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });
        if (uploadIssue) throw uploadIssue;
        const { data: row, error: insertIssue } = await supabase
          .from("study_attachments")
          .insert({
            user_id: user.id,
            subject_id: subjectId,
            title: file.name,
            type: attachmentTypeFor(file),
            storage_path: path,
            mime_type: file.type,
            size_bytes: file.size,
          })
          .select()
          .single();
        if (insertIssue) {
          await supabase.storage.from("study-files").remove([path]);
          throw insertIssue;
        }
        const mapped = fromAttachment(row);
        setData((state) => ({
          ...state,
          attachments: [...state.attachments, mapped],
        }));
        return mapped;
      });
    },
    getStudyAttachmentUrl: async (attachment) => {
      if (attachment.url) return attachment.url;
      if (!attachment.storagePath || isDemo) return null;
      const { data: signed, error: issue } = await supabase.storage
        .from("study-files")
        .createSignedUrl(attachment.storagePath, 60 * 10);
      if (issue) {
        setError(issue.message || "Não foi possível abrir o arquivo.");
        return null;
      }
      return signed.signedUrl;
    },
    addStudy: (form) =>
      insert(
        "study_sessions",
        {
          subject_id: form.subjectId,
          minutes: Number(form.minutes),
          started_at: new Date().toISOString(),
          notes: form.notes || "",
        },
        fromStudy,
        "studySessions",
      ),
    addStudyPath: (form) =>
      insert(
        "study_paths",
        {
          subject_id: form.subjectId || null,
          title: form.title,
          description: form.description || "",
        },
        fromStudyPath,
        "studyPaths",
      ),
    updateStudyPath: (id, form) =>
      update(
        "study_paths",
        id,
        {
          subject_id: form.subjectId || null,
          title: form.title,
          description: form.description || "",
        },
        fromStudyPath,
        "studyPaths",
      ),
    addStudyTopic: (form) =>
      insert(
        "study_topics",
        {
          path_id: form.pathId,
          title: form.title,
          resource_url: safeExternalUrl(form.resourceUrl) || null,
          notes: form.notes || "",
          position:
            data.studyTopics.filter((topic) => topic.pathId === form.pathId)
              .length + 1,
          completed_at: null,
        },
        fromStudyTopic,
        "studyTopics",
      ),
    updateStudyTopic: (id, form) =>
      update(
        "study_topics",
        id,
        {
          path_id: form.pathId,
          title: form.title,
          resource_url: safeExternalUrl(form.resourceUrl) || null,
          notes: form.notes || "",
        },
        fromStudyTopic,
        "studyTopics",
      ),
    toggleStudyTopic: (topic) =>
      update(
        "study_topics",
        topic.id,
        { completed_at: topic.completedAt ? null : new Date().toISOString() },
        fromStudyTopic,
        "studyTopics",
      ),
    addHabit: (form) =>
      insert(
        "habits",
        {
          name: form.name,
          frequency: form.frequency,
          target: Number(form.target),
          completed_dates: [],
        },
        fromHabit,
        "habits",
      ),
    updateHabit: (id, form) =>
      update(
        "habits",
        id,
        {
          name: form.name,
          frequency: form.frequency,
          target: Number(form.target),
        },
        fromHabit,
        "habits",
      ),
    toggleHabit: (habit) => {
      const completed = habit.completedDates.includes(today())
        ? habit.completedDates.filter((d) => d !== today())
        : [...habit.completedDates, today()];
      return update(
        "habits",
        habit.id,
        { completed_dates: completed },
        fromHabit,
        "habits",
      );
    },
    addMeal: (form) =>
      insert(
        "meal_entries",
        {
          title: form.title,
          meal_date: form.date,
          meal_type: form.type,
          planned_time: form.time || null,
          notes: form.notes || "",
          completed_at: null,
        },
        fromMeal,
        "meals",
      ),
    updateMeal: (id, form) =>
      update(
        "meal_entries",
        id,
        {
          title: form.title,
          meal_date: form.date,
          meal_type: form.type,
          planned_time: form.time || null,
          notes: form.notes || "",
        },
        fromMeal,
        "meals",
      ),
    toggleMeal: (meal) =>
      update(
        "meal_entries",
        meal.id,
        { completed_at: meal.completedAt ? null : new Date().toISOString() },
        fromMeal,
        "meals",
      ),
    setHydration: async (date, amountMl) => {
      const normalized = Math.max(0, Math.min(20000, Number(amountMl) || 0));
      if (isDemo) {
        localMutation((state) => {
          const existing = state.hydration.find((entry) => entry.date === date);
          const entry = existing
            ? { ...existing, amountMl: normalized }
            : { id: newId(), date, amountMl: normalized };
          return {
            ...state,
            hydration: existing
              ? state.hydration.map((item) =>
                  item.date === date ? entry : item,
                )
              : [...state.hydration, entry],
          };
        });
        return;
      }
      return remote(async () => {
        const { data: row, error: issue } = await supabase
          .from("hydration_logs")
          .upsert(
            { user_id: user.id, entry_date: date, amount_ml: normalized },
            { onConflict: "user_id,entry_date" },
          )
          .select()
          .single();
        if (issue) throw issue;
        const mapped = fromHydration(row);
        setData((state) => ({
          ...state,
          hydration: state.hydration.some((item) => item.date === date)
            ? state.hydration.map((item) =>
                item.date === date ? mapped : item,
              )
            : [...state.hydration, mapped],
        }));
        return mapped;
      });
    },
    addWorkout: (form) =>
      insert(
        "workouts",
        {
          name: form.name,
          focus: form.bodyPart,
          body_part: form.bodyPart,
          duration_minutes: Number(form.duration),
          days: form.days,
        },
        fromWorkout,
        "workouts",
      ),
    updateWorkout: (id, form) =>
      update(
        "workouts",
        id,
        {
          name: form.name,
          focus: form.bodyPart,
          body_part: form.bodyPart,
          duration_minutes: Number(form.duration),
          days: form.days,
        },
        fromWorkout,
        "workouts",
      ),
    finishWorkout: (workoutId) =>
      insert(
        "workout_sessions",
        { workout_id: workoutId, completed_at: new Date().toISOString() },
        fromWorkoutSession,
        "workoutSessions",
      ),
    removeEvent: (id) => remove("calendar_events", id, "events"),
    removeTask: (id) => remove("tasks", id, "tasks"),
    removeNote: (id) => remove("notes", id, "notes"),
    removeSubject: async (id) => {
      const relatedAttachments = data.attachments.filter(
        (attachment) => attachment.subjectId === id,
      );
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          subjects: state.subjects.filter((subject) => subject.id !== id),
          attachments: state.attachments.filter(
            (attachment) => attachment.subjectId !== id,
          ),
        }));
        return;
      }
      return remote(async () => {
        const files = relatedAttachments
          .map((attachment) => attachment.storagePath)
          .filter(Boolean);
        if (files.length) {
          const { error: fileIssue } = await supabase.storage
            .from("study-files")
            .remove(files);
          if (fileIssue) throw fileIssue;
        }
        const { error: issue } = await supabase
          .from("study_subjects")
          .delete()
          .eq("id", id);
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          subjects: state.subjects.filter((subject) => subject.id !== id),
          attachments: state.attachments.filter(
            (attachment) => attachment.subjectId !== id,
          ),
        }));
      });
    },
    removeStudyAttachment: async (attachment) => {
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          attachments: state.attachments.filter(
            (item) => item.id !== attachment.id,
          ),
        }));
        return;
      }
      return remote(async () => {
        if (attachment.storagePath) {
          const { error: fileIssue } = await supabase.storage
            .from("study-files")
            .remove([attachment.storagePath]);
          if (fileIssue) throw fileIssue;
        }
        const { error: issue } = await supabase
          .from("study_attachments")
          .delete()
          .eq("id", attachment.id);
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          attachments: state.attachments.filter(
            (item) => item.id !== attachment.id,
          ),
        }));
      });
    },
    removeStudyPath: async (id) => {
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          studyPaths: state.studyPaths.filter((path) => path.id !== id),
          studyTopics: state.studyTopics.filter((topic) => topic.pathId !== id),
        }));
        return;
      }
      return remote(async () => {
        const { error: issue } = await supabase
          .from("study_paths")
          .delete()
          .eq("id", id);
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          studyPaths: state.studyPaths.filter((path) => path.id !== id),
          studyTopics: state.studyTopics.filter((topic) => topic.pathId !== id),
        }));
      });
    },
    removeStudyTopic: (id) => remove("study_topics", id, "studyTopics"),
    removeHabit: (id) => remove("habits", id, "habits"),
    removeMeal: (id) => remove("meal_entries", id, "meals"),
    removeWorkout: (id) => remove("workouts", id, "workouts"),
    saveProfile: async (form) => {
      const patch = {
        display_name: form.displayName,
        email_notifications: form.emailAlerts,
        sms_notifications: form.smsAlerts,
        phone: form.phone || null,
        daily_water_goal_ml: Number(form.dailyWaterGoal || 2000),
      };
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          profile: { ...state.profile, ...form },
        }));
        return;
      }
      return remote(async () => {
        const { error: issue } = await supabase
          .from("profiles")
          .upsert({ id: user.id, ...patch });
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          profile: { ...state.profile, ...form },
        }));
      });
    },
    setMfaRequired: async (enabled) => {
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          profile: { ...state.profile, mfaRequired: Boolean(enabled) },
        }));
        return true;
      }
      return remote(async () => {
        const { data: row, error: issue } = await supabase
          .from("profiles")
          .update({ mfa_required: Boolean(enabled) })
          .eq("id", user.id)
          .select()
          .single();
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          profile: { ...state.profile, mfaRequired: Boolean(row.mfa_required) },
        }));
        return true;
      });
    },
    setDailyWaterGoal: async (amountMl) => {
      const normalized = Math.max(
        250,
        Math.min(10000, Number(amountMl) || 2000),
      );
      if (isDemo) {
        localMutation((state) => ({
          ...state,
          profile: { ...state.profile, dailyWaterGoal: normalized },
        }));
        return normalized;
      }
      return remote(async () => {
        const { data: row, error: issue } = await supabase
          .from("profiles")
          .update({ daily_water_goal_ml: normalized })
          .eq("id", user.id)
          .select()
          .single();
        if (issue) throw issue;
        setData((state) => ({
          ...state,
          profile: {
            ...state.profile,
            dailyWaterGoal: Number(row.daily_water_goal_ml || normalized),
          },
        }));
        return normalized;
      });
    },
  };
}

function AuthScreen({ auth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setBusy(true);
    const result =
      mode === "login"
        ? await auth.signIn(email, password)
        : await auth.signUp(email, password);
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else
      setMessage(
        mode === "login"
          ? "Entrando…"
          : "Conta criada. Confira seu e-mail para confirmar o cadastro.",
      );
  }
  async function recoverPassword() {
    if (!email) {
      setMessage("Informe seu e-mail para receber o link de recuperação.");
      return;
    }
    setBusy(true);
    const result = await auth.resetPassword(email);
    setBusy(false);
    setMessage(
      result.error
        ? result.error.message
        : "Se houver uma conta para este e-mail, enviaremos um link de recuperação.",
    );
  }
  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Acesso à Moletas">
        <Brand />
        <form onSubmit={submit}>
          <label>
            <span className="sr-only">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span className="sr-only">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
              minLength="8"
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          {message && <p className="form-message">{message}</p>}
          <button className="button primary wide" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
        <div className="auth-actions">
          <button
            className="text-action"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setMessage("");
            }}
          >
            {mode === "login" ? "Criar conta" : "Entrar"}
          </button>
          {mode === "login" && (
            <button
              className="text-action auth-recovery"
              onClick={recoverPassword}
              type="button"
            >
              Recuperar senha
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function Stat({ value, label, accent = "violet" }) {
  return (
    <article className={`stat-card ${accent}`}>
      <span>{value}</span>
      <small>{label}</small>
    </article>
  );
}
function Empty({ text, action, onAction }) {
  return (
    <div className="empty">
      <span>✦</span>
      <p>{text}</p>
      {action && (
        <button className="text-action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
function SectionTitle({ eyebrow, title, action, onAction }) {
  return (
    <div className="section-title">
      <div>
        {eyebrow && <span className="context-label eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-action" onClick={onAction}>
          {action} →
        </button>
      )}
    </div>
  );
}

function Brand({ compact = false }) {
  return (
    <div
      className={`brand ${compact ? "brand-compact" : ""}`}
      aria-label="Moletas"
    >
      <span className="brand-symbol" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
        <b></b>
      </span>
      {!compact && <strong>Moletas</strong>}
    </div>
  );
}

function NavIcon({ name }) {
  const icons = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <path d="M15 17.5h5M17.5 15v5" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
    tasks: (
      <>
        <path d="m4 7 2.2 2.2L10 5.4M13 7h7M4 17l2.2 2.2L10 15.4M13 19h7" />
      </>
    ),
    notes: (
      <>
        <path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5M8 13h8M8 17h6" />
      </>
    ),
    study: (
      <>
        <path d="M4 5.8A3.8 3.8 0 0 1 8 5h3.4c1 0 1.8.8 1.8 1.8V20H8a4 4 0 0 0-4 1V5.8Z" />
        <path d="M20 5.8A3.8 3.8 0 0 0 16 5h-2.8v15H16a4 4 0 0 1 4 1V5.8ZM8 9h2.5M16 9h-1.2" />
      </>
    ),
    routine: (
      <>
        <path d="M20 8A8.5 8.5 0 1 0 20.5 15" />
        <path d="M20 3v5h-5M12 7v5l3 2" />
      </>
    ),
    nutrition: (
      <>
        <path d="M4 4v6M7 4v6M4 7h3M5.5 10v10M14 4v7a3 3 0 0 0 6 0V4M17 14v6" />
      </>
    ),
    workouts: (
      <>
        <path d="M8 8v8M5 10v4M3 9v6M16 8v8M19 10v4M21 9v6M8 12h8" />
      </>
    ),
    alerts: (
      <>
        <path d="M18 10a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 22h4" />
        <path d="M19 5.5 21 4M5 5.5 3 4" />
      </>
    ),
    account: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0M18 14.5l1.2 1.2L22 13" />
      </>
    ),
    more: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1.7" />
        <rect x="14" y="4" width="6" height="6" rx="1.7" />
        <rect x="4" y="14" width="6" height="6" rx="1.7" />
        <path d="M17 15.5v3M15.5 17h3" />
      </>
    ),
  };
  return (
    <span className={`nav-icon nav-icon-${name}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        {icons[name] || icons.overview}
      </svg>
    </span>
  );
}

function ThemeIcon({ theme }) {
  return (
    <svg className="theme-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {theme === "light" ? (
        <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z" />
      ) : (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}

function mondayOf(date = new Date()) {
  const value = new Date(date);
  const offset = (value.getDay() + 6) % 7;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - offset);
  return value;
}
function isoFor(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function WeekPerspective({ data, openModal, showCaption = true }) {
  const [selected, setSelected] = useState(today());
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = mondayOf();
        date.setDate(date.getDate() + index);
        return date;
      }),
    [],
  );
  const selectedEvents = data.events
    .filter((event) => dateInput(event.startsAt) === selected)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  const selectedTasks = data.tasks.filter(
    (task) => task.dueDate === selected && !task.completedAt,
  );
  const selectedStudy = data.studySessions
    .filter((session) => dateInput(session.startedAt) === selected)
    .reduce((sum, session) => sum + session.minutes, 0);
  const selectedWorkout = data.workoutSessions.some(
    (session) => dateInput(session.completedAt) === selected,
  );
  return (
    <section className="week-perspective">
      <div className="week-topline">
        <div>
          <span className="eyebrow">VISÃO SEMANAL</span>
          <h2>
            {showCaption ? "Sua semana, de relance." : "Planejamento da semana"}
          </h2>
        </div>
        <button className="week-add" onClick={() => openModal("event")}>
          ＋ Planejar
        </button>
      </div>
      <div className="week-days">
        {days.map((day) => {
          const date = isoFor(day);
          const dayEvents = data.events.filter(
            (event) => dateInput(event.startsAt) === date,
          );
          const pending = data.tasks.filter(
            (task) => task.dueDate === date && !task.completedAt,
          ).length;
          const study = data.studySessions
            .filter((session) => dateInput(session.startedAt) === date)
            .reduce((sum, session) => sum + session.minutes, 0);
          const trained = data.workoutSessions.some(
            (session) => dateInput(session.completedAt) === date,
          );
          const occupied = Math.min(
            4,
            dayEvents.length + pending + (study ? 1 : 0) + (trained ? 1 : 0),
          );
          return (
            <button
              key={date}
              className={`week-day ${selected === date ? "selected" : ""} ${date === today() ? "today" : ""}`}
              onClick={() => setSelected(date)}
            >
              <span>{weekday(day)}</span>
              <strong>{day.getDate()}</strong>
              <div className="day-signals">
                {Array.from({ length: 4 }, (_, index) => (
                  <i className={index < occupied ? "on" : ""} key={index}></i>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="day-detail">
        <div className="day-detail-heading">
          <div>
            <span className="eyebrow">
              {selected === today()
                ? "HOJE"
                : capitalize(
                    new Intl.DateTimeFormat("pt-BR", {
                      weekday: "long",
                    }).format(new Date(`${selected}T12:00`)),
                  )}
            </span>
            <h3>
              {new Intl.DateTimeFormat("pt-BR", {
                day: "numeric",
                month: "long",
              }).format(new Date(`${selected}T12:00`))}
            </h3>
          </div>
          <div className="day-score">
            <span>
              {selectedEvents.length +
                selectedTasks.length +
                (selectedStudy ? 1 : 0) +
                (selectedWorkout ? 1 : 0)}
            </span>
            <small>Pontos de foco</small>
          </div>
        </div>
        <div className="day-flow">
          <div className="flow-group">
            <span>AGENDA</span>
            {selectedEvents.length ? (
              selectedEvents.slice(0, 2).map((event) => (
                <p key={event.id}>
                  <b>{timeInput(event.startsAt)}</b>
                  {event.title}
                </p>
              ))
            ) : (
              <p className="muted-flow">Sem compromisso marcado</p>
            )}
          </div>
          <div className="flow-group">
            <span>EXECUÇÃO</span>
            {selectedTasks.length ? (
              selectedTasks.slice(0, 2).map((task) => (
                <p key={task.id}>
                  <b>✓</b>
                  {task.title}
                </p>
              ))
            ) : (
              <p className="muted-flow">Sem tarefas pendentes</p>
            )}
          </div>
          <div className="flow-group">
            <span>RITMO</span>
            <p>
              <b>{selectedStudy ? `${selectedStudy}m` : "—"}</b>
              {selectedWorkout
                ? "Estudo e treino registrados"
                : selectedStudy
                  ? "Registro de estudo"
                  : "Abra espaço para você"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WeeklyPlanner({ data, openModal }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf());
  const firstHour = 7;
  const slotHeight = 64;
  const hours = Array.from({ length: 15 }, (_, index) => firstHour + index);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + index);
        return date;
      }),
    [weekStart],
  );
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
  });
  const moveWeek = (amount) => {
    setWeekStart((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount * 7);
      return next;
    });
  };
  const eventTone = {
    Pessoal: "personal",
    Trabalho: "work",
    Estudos: "study",
    Saúde: "health",
  };

  return (
    <section className="weekly-planner" aria-label="Planner semanal">
      <div className="planner-toolbar">
        <div>
          <span className="eyebrow">PLANNER SEMANAL</span>
          <h2>
            {dateFormatter.format(days[0])} — {dateFormatter.format(days[6])}
          </h2>
        </div>
        <div className="planner-controls">
          <button type="button" onClick={() => moveWeek(-1)}>
            ← <span>Semana anterior</span>
          </button>
          <button type="button" onClick={() => setWeekStart(mondayOf())}>
            Hoje
          </button>
          <button type="button" onClick={() => moveWeek(1)}>
            <span>Próxima semana</span> →
          </button>
        </div>
      </div>
      <div className="planner-scroll">
        <div className="planner-grid">
          <div className="planner-corner">Hora</div>
          {days.map((day) => {
            const date = isoFor(day);
            return (
              <div
                className={`planner-day-head ${date === today() ? "today" : ""}`}
                key={date}
              >
                <span>
                  {new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
                    .format(day)
                    .replace(".", "")}
                </span>
                <strong>{day.getDate()}</strong>
              </div>
            );
          })}
          <div className="planner-time-rail" aria-hidden="true">
            {hours.map((hour) => (
              <span className="planner-hour" key={hour}>
                {pad(hour)}:00
              </span>
            ))}
          </div>
          {days.map((day) => {
            const date = isoFor(day);
            const dayEvents = data.events
              .filter((event) => dateInput(event.startsAt) === date)
              .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
            const dueTasks = data.tasks.filter(
              (task) => task.dueDate === date && !task.completedAt,
            );
            return (
              <section
                className={`planner-day ${date === today() ? "today" : ""}`}
                key={date}
                aria-label={`Planejamento de ${niceDate(`${date}T12:00`)}`}
              >
                <div className="planner-task-strip">
                  {dueTasks.slice(0, 2).map((task) => (
                    <button
                      className="planner-task-chip"
                      key={task.id}
                      onClick={() => openModal({ type: "task", initial: task })}
                      title={`Editar tarefa: ${task.title}`}
                      type="button"
                    >
                      {task.title}
                    </button>
                  ))}
                  {dueTasks.length > 2 && (
                    <span className="planner-task-more">
                      +{dueTasks.length - 2}
                    </span>
                  )}
                </div>
                <div className="planner-hours">
                  {hours.map((hour) => (
                    <button
                      aria-label={`Criar compromisso em ${date}, às ${pad(hour)} horas`}
                      className="planner-slot"
                      key={hour}
                      onClick={() =>
                        openModal({
                          type: "event",
                          preset: { date, time: `${pad(hour)}:00` },
                        })
                      }
                      type="button"
                    />
                  ))}
                  {dayEvents.map((event) => {
                    const start = new Date(event.startsAt);
                    const minutes =
                      (start.getHours() - firstHour) * 60 + start.getMinutes();
                    if (minutes < 0 || minutes >= hours.length * 60)
                      return null;
                    return (
                      <button
                        className={`planner-event ${eventTone[event.category] || "personal"}`}
                        key={event.id}
                        onClick={() =>
                          openModal({ type: "event", initial: event })
                        }
                        style={{ top: `${(minutes / 60) * slotHeight + 3}px` }}
                        title={`Editar compromisso: ${event.title}`}
                        type="button"
                      >
                        <time>{timeInput(event.startsAt)}</time>
                        <strong>{event.title}</strong>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="planner-hint">
        Toque em um horário livre para criar um compromisso. As tarefas com
        prazo aparecem no topo de cada dia.
      </p>
    </section>
  );
}

function LegacyDashboard({ data, openModal, planner }) {
  const dayTasks = data.tasks.filter(
    (task) => !task.dueDate || task.dueDate === today(),
  );
  const completed = dayTasks.filter((task) => task.completedAt).length;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weeklyStudy = data.studySessions
    .filter((session) => new Date(session.startedAt) >= weekStart)
    .reduce((sum, session) => sum + session.minutes, 0);
  const workouts = data.workoutSessions.filter(
    (session) => new Date(session.completedAt) >= weekStart,
  ).length;
  const events = [...data.events]
    .filter((item) => isToday(item.startsAt))
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat("pt-BR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
          <h1>
            Menos ruído.
            <br />
            <i>Mais intenção.</i>
          </h1>
          <p>Escolha uma coisa importante e comece por ela.</p>
        </div>
        <button className="button primary" onClick={() => openModal("task")}>
          ＋ Adicionar tarefa
        </button>
      </div>
      <div className="stats">
        <Stat
          value={`${completed}/${dayTasks.length || 0}`}
          label="Tarefas concluídas"
        />
        <Stat
          value={`${weeklyStudy}m`}
          label="Tempo de estudo na semana"
          accent="blue"
        />
        <Stat value={workouts} label="Treinos nesta semana" accent="green" />
        <Stat
          value={
            data.habits.filter((habit) =>
              habit.completedDates.includes(today()),
            ).length
          }
          label="Hábitos de hoje"
          accent="orange"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <SectionTitle
            eyebrow="AGENDA DE HOJE"
            title="Seu ritmo"
            action="Ver agenda"
            onAction={() => openModal("event")}
          />
          {events.length ? (
            <div className="timeline">
              {events.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <time>{timeInput(event.startsAt)}</time>
                  <span
                    className={`dot ${event.category.toLowerCase()}`}
                  ></span>
                  <div>
                    <strong>{event.title}</strong>
                    <small>
                      {event.category}
                      {event.notes ? ` · ${event.notes}` : ""}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              text="Seu dia está leve por enquanto."
              action="Criar compromisso"
              onAction={() => openModal("event")}
            />
          )}
        </section>
        <section className="panel">
          <SectionTitle
            eyebrow="FOCO DO DIA"
            title="Prioridades"
            action="Ver tarefas"
            onAction={() => openModal("task")}
          />
          {dayTasks.filter((task) => task.priority).length ? (
            <div className="check-list">
              {dayTasks
                .filter((task) => task.priority)
                .map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    planner={planner}
                    onToggle={() => planner.toggleTask(task)}
                  />
                ))}
            </div>
          ) : (
            <Empty
              text="Escolha até três tarefas que merecem foco."
              action="Criar prioridade"
              onAction={() => openModal("task")}
            />
          )}
        </section>
      </div>
      <section className="insight">
        <span>⌁</span>
        <div>
          <strong>Espaço para os estudos</strong>
          <p>
            {data.subjects.length
              ? `Você já tem ${data.subjects.length} área${data.subjects.length > 1 ? "s" : ""} de estudo criada${data.subjects.length > 1 ? "s" : ""}. Que tal registrar sua próxima sessão?`
              : "Organize seus estudos por matéria, registre sessões e acompanhe seu tempo de foco."}
          </p>
        </div>
        <button
          className="button ghost"
          onClick={() => openModal(data.subjects.length ? "study" : "subject")}
        >
          {data.subjects.length ? "Registrar sessão" : "Criar área"}
        </button>
      </section>
    </>
  );
}

function TaskTimer({ task, planner }) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const completedRef = useRef(false);
  const duration = Number(task.durationMinutes || 0);
  const elapsed = elapsedTaskSeconds(task, currentTime);
  const remaining = Math.max(0, duration * 60 - elapsed);
  const activeTimer = Boolean(task.timerStartedAt) && !task.completedAt;
  const running = activeTimer && remaining > 0;
  const progress = duration
    ? Math.min(100, Math.round((elapsed / (duration * 60)) * 100))
    : 0;

  useEffect(() => {
    if (!running) return undefined;
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  useEffect(() => {
    if (activeTimer && remaining === 0 && !completedRef.current) {
      completedRef.current = true;
      planner.finishTaskTimer(task);
    }
    if (!running && remaining > 0) completedRef.current = false;
  }, [activeTimer, planner, remaining, running, task]);

  if (!duration) return null;

  return (
    <section
      className={`task-timer ${running ? "is-running" : ""} ${remaining === 0 ? "is-finished" : ""}`}
      aria-label={`Cronômetro de ${task.title}`}
    >
      <div className="timer-heading">
        <span>
          {task.completedAt || remaining === 0
            ? "Tempo concluído"
            : running
              ? "Em andamento"
              : "Tempo planejado"}
        </span>
        <strong aria-live={running ? "polite" : "off"}>
          {formatTimer(remaining)}
        </strong>
      </div>
      <div className="timer-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }}></i>
      </div>
      {!task.completedAt && (
        <div className="timer-actions">
          {remaining === 0 ? (
            <button
              type="button"
              className="timer-control primary"
              onClick={() => planner.finishTaskTimer(task)}
            >
              Concluir tarefa
            </button>
          ) : (
            <button
              type="button"
              className="timer-control primary"
              onClick={() =>
                running
                  ? planner.pauseTaskTimer(task)
                  : planner.startTaskTimer(task)
              }
            >
              {running ? "Pausar" : elapsed ? "Retomar" : "Iniciar"}
            </button>
          )}
          {elapsed > 0 && (
            <button
              type="button"
              className="timer-control secondary"
              onClick={() => planner.resetTaskTimer(task)}
            >
              Reiniciar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, onToggle, onDelete, onEdit, planner }) {
  return (
    <div className={`task-row ${task.completedAt ? "completed" : ""}`}>
      <button
        className="check"
        aria-label={task.completedAt ? "Reabrir tarefa" : "Concluir tarefa"}
        onClick={onToggle}
      >
        {task.completedAt ? "✓" : ""}
      </button>
      <div className="task-content">
        <strong>{task.title}</strong>
        <small>
          {task.dueDate
            ? task.dueDate === today()
              ? "Hoje"
              : capitalize(
                  new Intl.DateTimeFormat("pt-BR", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(`${task.dueDate}T12:00`)),
                )
            : "Sem prazo"}{" "}
          · {task.category}
        </small>
        {planner && <TaskTimer task={task} planner={planner} />}
      </div>
      {task.priority && <span className="priority-badge">FOCO</span>}
      {onEdit && (
        <button className="edit" onClick={onEdit} aria-label="Editar tarefa">
          Editar
        </button>
      )}
      {onDelete && (
        <button
          className="delete"
          onClick={onDelete}
          aria-label="Excluir tarefa"
        >
          ×
        </button>
      )}
    </div>
  );
}

function LegacyAgenda({ data, openModal, planner }) {
  const events = [...data.events].sort(
    (a, b) => new Date(a.startsAt) - new Date(b.startsAt),
  );
  return (
    <PageFrame
      eyebrow="PLANEJAMENTO"
      title="Agenda"
      copy="Guarde espaço para o que realmente precisa acontecer."
      action="Novo compromisso"
      onAction={() => openModal("event")}
    >
      <section className="panel agenda-panel">
        {events.length ? (
          <div className="event-list">
            {events.map((event) => (
              <article className="event-row" key={event.id}>
                <div className={`event-date ${event.category.toLowerCase()}`}>
                  <b>{new Date(event.startsAt).getDate()}</b>
                  <span>{weekday(event.startsAt)}</span>
                </div>
                <div>
                  <strong>{event.title}</strong>
                  <p>
                    {niceDate(event.startsAt, true)} · {event.category}
                  </p>
                  {event.notes && <small>{event.notes}</small>}
                </div>
                <span className="reminder">◌ {event.reminderMinutes} min</span>
                <button
                  className="edit"
                  onClick={() => openModal({ type: "event", initial: event })}
                  aria-label="Editar compromisso"
                >
                  Editar
                </button>
                <button
                  className="delete"
                  onClick={() => planner.removeEvent(event.id)}
                  aria-label="Excluir compromisso"
                >
                  ×
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            text="Nenhum compromisso por aqui ainda."
            action="Criar o primeiro"
            onAction={() => openModal("event")}
          />
        )}
      </section>
    </PageFrame>
  );
}

function Tasks({ data, openModal, planner }) {
  const [filter, setFilter] = useState("todas");
  const tasks = data.tasks.filter((task) =>
    filter === "todas" || filter === "pendentes"
      ? filter === "todas" || !task.completedAt
      : Boolean(task.completedAt),
  );
  return (
    <PageFrame
      eyebrow="EXECUÇÃO"
      title="Tarefas"
      copy="Concentre sua energia no que cabe no seu dia."
      action="Nova tarefa"
      onAction={() => openModal("task")}
    >
      <div className="segmented">
        <button
          className={filter === "todas" ? "active" : ""}
          onClick={() => setFilter("todas")}
        >
          Todas <span>{data.tasks.length}</span>
        </button>
        <button
          className={filter === "pendentes" ? "active" : ""}
          onClick={() => setFilter("pendentes")}
        >
          Pendentes
        </button>
        <button
          className={filter === "concluidas" ? "active" : ""}
          onClick={() => setFilter("concluidas")}
        >
          Concluídas
        </button>
      </div>
      <section className="panel task-panel">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              planner={planner}
              onToggle={() => planner.toggleTask(task)}
              onEdit={() => openModal({ type: "task", initial: task })}
              onDelete={() => planner.removeTask(task.id)}
            />
          ))
        ) : (
          <Empty text="Nada neste filtro." />
        )}
      </section>
    </PageFrame>
  );
}

function Notes({ data, openModal, planner }) {
  return (
    <PageFrame
      eyebrow="CAPTURA RÁPIDA"
      title="Notas"
      copy="Guarde ideias, referências e decisões antes que elas se percam no meio do dia."
      action="Nova nota"
      onAction={() => openModal("note")}
    >
      <div className="notes-grid">
        {data.notes.length ? (
          data.notes.map((note) => (
            <article
              className={`note-card ${note.pinned ? "pinned" : ""}`}
              key={note.id}
            >
              <div className="note-card-head">
                <span>{note.pinned ? "FIXADA" : "NOTA"}</span>
                <div className="item-actions">
                  <button
                    className="edit"
                    onClick={() => openModal({ type: "note", initial: note })}
                    aria-label="Editar nota"
                  >
                    Editar
                  </button>
                  <button
                    className="delete"
                    onClick={() => planner.removeNote(note.id)}
                    aria-label="Excluir nota"
                  >
                    ×
                  </button>
                </div>
              </div>
              <h3>{note.title}</h3>
              <p>{note.content}</p>
              <small>Atualizada em {niceDate(note.updatedAt, true)}</small>
            </article>
          ))
        ) : (
          <Empty
            text="Use as notas para capturar uma ideia sem precisar transformá-la em tarefa agora."
            action="Criar nota"
            onAction={() => openModal("note")}
          />
        )}
      </div>
    </PageFrame>
  );
}

function StudyPathCard({ path, data, planner, onEdit }) {
  const topics = data.studyTopics
    .filter((topic) => topic.pathId === path.id)
    .sort((a, b) => a.position - b.position);
  const complete = topics.filter((topic) => topic.completedAt).length;
  const subject = data.subjects.find((item) => item.id === path.subjectId);
  const progress = topics.length
    ? Math.round((complete / topics.length) * 100)
    : 0;

  return (
    <article className="learning-path">
      <header className="learning-path-head">
        <div>
          <span className="path-label">{subject?.name || "Estudo livre"}</span>
          <h3>{path.title}</h3>
        </div>
        <div className="item-actions">
          <button className="edit" onClick={onEdit} aria-label="Editar trilha">
            Editar
          </button>
          <button
            className="delete"
            onClick={() => planner.removeStudyPath(path.id)}
            aria-label="Excluir trilha de estudos"
          >
            ×
          </button>
        </div>
      </header>
      {path.description && (
        <p className="path-description">{path.description}</p>
      )}
      <div className="path-progress">
        <div>
          <span>Progresso</span>
          <strong>
            {complete}/{topics.length || 0} tópicos
          </strong>
        </div>
        <b>{progress}%</b>
      </div>
      <div className="path-meter" aria-label={`${progress}% concluído`}>
        <i style={{ width: `${progress}%` }}></i>
      </div>
      <div className="topic-list">
        {topics.length ? (
          topics.map((topic, index) => {
            const link = safeExternalUrl(topic.resourceUrl);
            return (
              <article
                className={`topic-row ${topic.completedAt ? "done" : ""}`}
                key={topic.id}
              >
                <button
                  className="topic-check"
                  onClick={() => planner.toggleStudyTopic(topic)}
                  aria-label={
                    topic.completedAt ? "Reabrir tópico" : "Concluir tópico"
                  }
                >
                  {topic.completedAt ? "✓" : index + 1}
                </button>
                <div>
                  <strong>{topic.title}</strong>
                  {topic.notes && <small>{topic.notes}</small>}
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer">
                      Abrir material <span>↗</span>
                    </a>
                  )}
                </div>
                <div className="item-actions">
                  <button
                    className="edit"
                    onClick={() => onEdit({ type: "topic", initial: topic })}
                    aria-label="Editar tópico"
                  >
                    Editar
                  </button>
                  <button
                    className="delete"
                    onClick={() => planner.removeStudyTopic(topic.id)}
                    aria-label="Excluir tópico"
                  >
                    ×
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="path-empty">
            Adicione o primeiro tópico para começar esta trilha.
          </p>
        )}
      </div>
    </article>
  );
}

function Study({ data, openModal, planner }) {
  const minutes = data.studySessions
    .filter(
      (session) =>
        new Date(session.startedAt) >= new Date(Date.now() - 7 * 86400000),
    )
    .reduce((sum, session) => sum + session.minutes, 0);
  return (
    <PageFrame
      eyebrow="CONCENTRAÇÃO"
      title="Estudos"
      copy="Transforme cada matéria em um caminho contínuo, com tópicos, anotações e materiais de apoio."
      action="Nova trilha"
      onAction={() => openModal("path")}
    >
      <div className="study-banner clean-banner">
        <div>
          <span className="eyebrow">TEMPO DE FOCO · 7 DIAS</span>
          <strong>
            {Math.floor(minutes / 60)}h {minutes % 60}m
          </strong>
          <p>Registre sessões e mantenha o ritmo do seu aprendizado.</p>
        </div>
        <button
          className="button light"
          onClick={() => openModal(data.subjects.length ? "study" : "subject")}
        >
          {data.subjects.length ? "Registrar sessão" : "Criar matéria"}
        </button>
      </div>

      <section className="learning-paths-section">
        <SectionTitle
          eyebrow="CAMINHO CONTÍNUO"
          title="Trilhas de estudo"
          action={data.studyPaths.length ? "Adicionar tópico" : "Criar trilha"}
          onAction={() => openModal(data.studyPaths.length ? "topic" : "path")}
        />
        {data.studyPaths.length ? (
          <div className="learning-path-grid">
            {data.studyPaths.map((path) => (
              <StudyPathCard
                key={path.id}
                path={path}
                data={data}
                planner={planner}
                onEdit={(request = { type: "path", initial: path }) =>
                  openModal(request)
                }
              />
            ))}
          </div>
        ) : (
          <Empty
            text="Crie uma trilha para organizar os tópicos da sua matéria em uma sequência que faz sentido para você."
            action="Criar trilha"
            onAction={() => openModal("path")}
          />
        )}
      </section>

      <SectionTitle
        title="Suas matérias"
        action="Criar matéria"
        onAction={() => openModal("subject")}
      />
      <div className="subject-grid">
        {data.subjects.map((subject) => {
          const sum = data.studySessions
            .filter(
              (session) =>
                session.subjectId === subject.id &&
                new Date(session.startedAt) >=
                  new Date(Date.now() - 7 * 86400000),
            )
            .reduce((total, session) => total + session.minutes, 0);
          return (
            <article
              className="subject-card"
              key={subject.id}
              style={{ "--subject": subject.color }}
            >
              <span className="subject-dot"></span>
              <h3>{subject.name}</h3>
              <p>
                {sum} de {subject.targetMinutes} min nesta semana
              </p>
              <div className="meter">
                <i
                  style={{
                    width: `${Math.min(100, Math.round((sum / subject.targetMinutes) * 100))}%`,
                  }}
                ></i>
              </div>
              <button
                className="subject-materials"
                onClick={() =>
                  openModal({ type: "materials", initial: subject })
                }
              >
                Materiais{" "}
                <span>
                  {
                    data.attachments.filter(
                      (item) => item.subjectId === subject.id,
                    ).length
                  }
                </span>
              </button>
              <button
                className="edit subject-edit"
                onClick={() => openModal({ type: "subject", initial: subject })}
                aria-label="Editar matéria"
              >
                Editar
              </button>
              <button
                className="delete"
                onClick={() => planner.removeSubject(subject.id)}
                aria-label="Excluir matéria"
              >
                ×
              </button>
            </article>
          );
        })}
      </div>
      {!data.subjects.length && (
        <Empty
          text="Crie uma matéria para organizar seus blocos de estudo."
          action="Criar matéria"
          onAction={() => openModal("subject")}
        />
      )}
      <section className="panel recent-panel">
        <SectionTitle eyebrow="HISTÓRICO" title="Últimas sessões" />
        {data.studySessions.length ? (
          data.studySessions.slice(0, 5).map((session) => (
            <div className="history-row" key={session.id}>
              <span>⌁</span>
              <div>
                <strong>
                  {data.subjects.find(
                    (subject) => subject.id === session.subjectId,
                  )?.name || "Matéria removida"}
                </strong>
                <small>
                  {niceDate(session.startedAt, true)}
                  {session.notes ? ` · ${session.notes}` : ""}
                </small>
              </div>
              <b>{session.minutes} min</b>
            </div>
          ))
        ) : (
          <Empty text="Quando registrar uma sessão, ela aparecerá aqui." />
        )}
      </section>
    </PageFrame>
  );
}

function Routine({ data, openModal, planner }) {
  const done = data.habits.filter((habit) =>
    habit.completedDates.includes(today()),
  ).length;
  return (
    <PageFrame
      eyebrow="PEQUENOS ACORDOS"
      title="Rotina"
      copy="Hábitos leves, repetidos com carinho, fazem diferença."
      action="Novo hábito"
      onAction={() => openModal("habit")}
    >
      <div className="routine-progress">
        <div>
          <span className="eyebrow">HOJE</span>
          <strong>
            {done}/{data.habits.length || 0}
          </strong>
          <p>Hábitos concluídos</p>
        </div>
        <div
          className="big-ring"
          style={{
            "--progress": `${data.habits.length ? (done / data.habits.length) * 360 : 0}deg`,
          }}
        >
          {Math.round(
            data.habits.length ? (done / data.habits.length) * 100 : 0,
          )}
          %
        </div>
      </div>
      <div className="habit-grid">
        {data.habits.map((habit) => (
          <article
            className={`habit-card ${habit.completedDates.includes(today()) ? "done" : ""}`}
            key={habit.id}
          >
            <button
              className="habit-toggle"
              onClick={() => planner.toggleHabit(habit)}
            >
              {habit.completedDates.includes(today()) ? "✓" : "○"}
            </button>
            <div>
              <strong>{habit.name}</strong>
              <small>{habit.frequency.join(" · ")}</small>
            </div>
            <button
              className="edit"
              onClick={() => openModal({ type: "habit", initial: habit })}
              aria-label="Editar hábito"
            >
              Editar
            </button>
            <button
              className="delete"
              onClick={() => planner.removeHabit(habit.id)}
              aria-label="Excluir hábito"
            >
              ×
            </button>
          </article>
        ))}
      </div>
      {!data.habits.length && (
        <Empty
          text="Comece por um hábito simples que você consegue cumprir hoje."
          action="Criar hábito"
          onAction={() => openModal("habit")}
        />
      )}
    </PageFrame>
  );
}

function WorkoutPlanCard({ workout, planner, data, onEdit }) {
  const done = data.workoutSessions.some(
    (session) =>
      session.workoutId === workout.id && isToday(session.completedAt),
  );
  return (
    <article className="workout-plan-card">
      <div className="workout-card-topline">
        <span className="muscle-chip">{workout.bodyPart || workout.focus}</span>
        <div className="item-actions">
          <button className="edit" onClick={onEdit} aria-label="Editar treino">
            Editar
          </button>
          <button
            className="delete"
            onClick={() => planner.removeWorkout(workout.id)}
            aria-label="Excluir treino"
          >
            ×
          </button>
        </div>
      </div>
      <h3>{workout.name}</h3>
      <p>{workout.duration} minutos</p>
      <button
        className={`workout-finish ${done ? "done" : ""}`}
        onClick={() => !done && planner.finishWorkout(workout.id)}
        disabled={done}
      >
        {done ? "✓ Concluído hoje" : "Concluir treino"}
      </button>
    </article>
  );
}

const mealSlots = [
  { name: "Café da manhã", time: "07:30", marker: "Manhã" },
  { name: "Almoço", time: "12:30", marker: "Meio-dia" },
  { name: "Lanche", time: "16:00", marker: "Tarde" },
  { name: "Jantar", time: "20:00", marker: "Noite" },
];

function MealCard({ meal, planner, openModal }) {
  return (
    <article className={`meal-card ${meal.completedAt ? "done" : ""}`}>
      <div className="meal-card-head">
        <button
          className="meal-check"
          onClick={() => planner.toggleMeal(meal)}
          type="button"
          aria-label={
            meal.completedAt ? "Marcar como pendente" : "Marcar como consumida"
          }
        >
          {meal.completedAt ? "✓" : ""}
        </button>
        <span>{meal.time || "Sem horário"}</span>
        <div className="item-actions">
          <button
            className="edit"
            onClick={() => openModal({ type: "meal", initial: meal })}
            type="button"
          >
            Editar
          </button>
          <button
            className="delete"
            onClick={() => planner.removeMeal(meal.id)}
            type="button"
            aria-label="Excluir refeição"
          >
            ×
          </button>
        </div>
      </div>
      <strong>{meal.title}</strong>
      {meal.notes && <p>{meal.notes}</p>}
    </article>
  );
}

function Nutrition({ data, openModal, planner }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [goal, setGoal] = useState(data.profile.dailyWaterGoal || 2000);
  useEffect(() => {
    setGoal(data.profile.dailyWaterGoal || 2000);
  }, [data.profile.dailyWaterGoal]);
  const meals = data.meals
    .filter((meal) => meal.date === selectedDate)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  const completed = meals.filter((meal) => meal.completedAt).length;
  const hydration =
    data.hydration.find((entry) => entry.date === selectedDate)?.amountMl || 0;
  const waterGoal = Math.max(250, Number(data.profile.dailyWaterGoal || 2000));
  const hydrationProgress = Math.min(
    100,
    Math.round((hydration / waterGoal) * 100),
  );
  const formattedDate = capitalize(
    new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(`${selectedDate}T12:00`)),
  );
  const moveDay = (amount) => {
    const next = new Date(`${selectedDate}T12:00`);
    next.setDate(next.getDate() + amount);
    setSelectedDate(isoFor(next));
  };
  const saveGoal = () => {
    const normalized = Math.max(250, Math.min(10000, Number(goal) || 2000));
    setGoal(normalized);
    planner.setDailyWaterGoal(normalized);
  };

  return (
    <PageFrame
      eyebrow="BEM-ESTAR"
      title="Alimentação"
      copy="Planeje as refeições do dia, registre o que comeu e acompanhe a sua hidratação."
      action="Nova refeição"
      onAction={() =>
        openModal({ type: "meal", preset: { date: selectedDate } })
      }
    >
      <section className="nutrition-overview">
        <div className="nutrition-date-nav">
          <button
            type="button"
            onClick={() => moveDay(-1)}
            aria-label="Dia anterior"
          >
            ←
          </button>
          <div>
            <span className="eyebrow">PLANO DO DIA</span>
            <strong>{formattedDate}</strong>
          </div>
          <button
            type="button"
            onClick={() => moveDay(1)}
            aria-label="Próximo dia"
          >
            →
          </button>
        </div>
        <button
          className="nutrition-today"
          type="button"
          onClick={() => setSelectedDate(today())}
        >
          Hoje
        </button>
        <div className="nutrition-status">
          <strong>
            {completed}/{meals.length || 0}
          </strong>
          <span>Refeições concluídas</span>
        </div>
      </section>
      <div className="nutrition-layout">
        <section className="meal-board" aria-label="Refeições do dia">
          {mealSlots.map((slot) => {
            const entries = meals.filter((meal) => meal.type === slot.name);
            return (
              <article className="meal-lane" key={slot.name}>
                <header>
                  <span>{slot.marker}</span>
                  <h2>{slot.name}</h2>
                  <small>{slot.time}</small>
                </header>
                <div className="meal-lane-content">
                  {entries.length ? (
                    entries.map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        planner={planner}
                        openModal={openModal}
                      />
                    ))
                  ) : (
                    <p>Nada planejado ainda.</p>
                  )}
                  <button
                    className="meal-add"
                    type="button"
                    onClick={() =>
                      openModal({
                        type: "meal",
                        preset: {
                          date: selectedDate,
                          type: slot.name,
                          time: slot.time,
                        },
                      })
                    }
                  >
                    ＋ Adicionar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        <aside className="hydration-card">
          <span className="eyebrow">HIDRATAÇÃO</span>
          <div
            className="hydration-ring"
            style={{ "--water-progress": `${hydrationProgress}%` }}
            aria-label={`${hydration} de ${waterGoal} mililitros de água`}
          >
            <div>
              <strong>
                {hydration >= 1000
                  ? `${(hydration / 1000).toFixed(1)} L`
                  : `${hydration} ml`}
              </strong>
              <span>
                de{" "}
                {waterGoal >= 1000
                  ? `${(waterGoal / 1000).toFixed(1)} L`
                  : `${waterGoal} ml`}
              </span>
            </div>
          </div>
          <div className="hydration-actions">
            {[250, 500].map((amount) => (
              <button
                key={amount}
                onClick={() =>
                  planner.setHydration(selectedDate, hydration + amount)
                }
                type="button"
              >
                +{amount} ml
              </button>
            ))}
            {hydration > 0 && (
              <button
                onClick={() =>
                  planner.setHydration(
                    selectedDate,
                    Math.max(0, hydration - 250),
                  )
                }
                type="button"
              >
                −250 ml
              </button>
            )}
          </div>
          <label className="water-goal">
            Meta diária (ml)
            <input
              type="number"
              min="250"
              max="10000"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              onBlur={saveGoal}
            />
          </label>
        </aside>
      </div>
    </PageFrame>
  );
}

function Workouts({ data, openModal, planner }) {
  const [view, setView] = useState("day");
  const days = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const groupNames = [
    ...new Set(
      data.workouts.map((workout) => workout.bodyPart || workout.focus),
    ),
  ];
  const groups =
    view === "day"
      ? [
          ...days.filter((day) =>
            data.workouts.some((workout) => workout.days.includes(day)),
          ),
          ...(data.workouts.some((workout) => !workout.days.length)
            ? ["Sem dia definido"]
            : []),
        ]
      : groupNames;
  const workoutsFor = (group) =>
    view === "day"
      ? data.workouts.filter((workout) =>
          group === "Sem dia definido"
            ? !workout.days.length
            : workout.days.includes(group),
        )
      : data.workouts.filter(
          (workout) => (workout.bodyPart || workout.focus) === group,
        );

  return (
    <PageFrame
      eyebrow="MOVIMENTO"
      title="Treinos"
      copy="Organize seu plano por dia da semana ou pelo grupo muscular que deseja trabalhar."
      action="Novo treino"
      onAction={() => openModal("workout")}
    >
      <section className="workout-planner">
        <div className="workout-planner-head">
          <div>
            <span className="eyebrow">PLANO DA SEMANA</span>
            <h2>
              {view === "day"
                ? "Treinos por dia"
                : "Treinos por grupo muscular"}
            </h2>
          </div>
          <div
            className="view-toggle"
            role="group"
            aria-label="Organizar treinos por"
          >
            <button
              className={view === "day" ? "active" : ""}
              aria-pressed={view === "day"}
              onClick={() => setView("day")}
            >
              Por dia
            </button>
            <button
              className={view === "muscle" ? "active" : ""}
              aria-pressed={view === "muscle"}
              onClick={() => setView("muscle")}
            >
              Por músculo
            </button>
          </div>
        </div>
        {data.workouts.length ? (
          <div className="workout-board">
            {groups.map((group) => (
              <section className="workout-lane" key={group}>
                <header>
                  <span>{view === "day" ? "DIA" : "GRUPO"}</span>
                  <h3>{group}</h3>
                  <small>
                    {workoutsFor(group).length} treino
                    {workoutsFor(group).length === 1 ? "" : "s"}
                  </small>
                </header>
                <div>
                  {workoutsFor(group).map((workout) => (
                    <WorkoutPlanCard
                      key={workout.id}
                      workout={workout}
                      planner={planner}
                      data={data}
                      onEdit={() =>
                        openModal({ type: "workout", initial: workout })
                      }
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            text="Monte seu primeiro treino e encaixe movimento na semana."
            action="Criar treino"
            onAction={() => openModal("workout")}
          />
        )}
      </section>
      <section className="panel recent-panel">
        <SectionTitle eyebrow="HISTÓRICO" title="Sessões recentes" />
        {data.workoutSessions.length ? (
          data.workoutSessions.slice(0, 6).map((session) => (
            <div className="history-row" key={session.id}>
              <span>◒</span>
              <div>
                <strong>
                  {data.workouts.find(
                    (workout) => workout.id === session.workoutId,
                  )?.name || "Treino removido"}
                </strong>
                <small>{niceDate(session.completedAt, true)}</small>
              </div>
              <b>Concluído</b>
            </div>
          ))
        ) : (
          <Empty text="Seu histórico aparece depois do primeiro treino." />
        )}
      </section>
    </PageFrame>
  );
}

function Alerts({ data, openModal, planner }) {
  const [form, setForm] = useState(data.profile);
  const [saved, setSaved] = useState(false);
  const upcoming = data.events
    .filter(
      (event) =>
        new Date(event.startsAt) > new Date() && event.reminderMinutes > 0,
    )
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
  async function save(event) {
    event.preventDefault();
    await planner.saveProfile(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }
  return (
    <PageFrame
      eyebrow="LEMBRETES"
      title="Alertas"
      copy="Decida como e quando a Moletas deve chamar sua atenção."
    >
      <div className="alert-layout">
        <section className="panel settings-form">
          <SectionTitle title="Canais de aviso" />
          <form onSubmit={save}>
            <label className="switch-row">
              <div>
                <strong>E-mail</strong>
                <small>Receba lembretes no seu endereço de cadastro.</small>
              </div>
              <input
                type="checkbox"
                checked={form.emailAlerts}
                onChange={(e) =>
                  setForm({ ...form, emailAlerts: e.target.checked })
                }
              />
            </label>
            <label className="switch-row">
              <div>
                <strong>SMS / WhatsApp</strong>
                <small>Use um telefone em formato internacional.</small>
              </div>
              <input
                type="checkbox"
                checked={form.smsAlerts}
                onChange={(e) =>
                  setForm({ ...form, smsAlerts: e.target.checked })
                }
              />
            </label>
            <label>
              Telefone (opcional)
              <input
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+55 11 99999-9999"
              />
            </label>
            <button className="button primary">
              {saved ? "✓ Preferências salvas" : "Salvar preferências"}
            </button>
          </form>
          <p className="fine-print">
            E-mail e SMS só são enviados quando os serviços correspondentes
            forem configurados com chaves seguras no servidor.
          </p>
        </section>
        <section className="panel">
          <SectionTitle
            title="Próximos alertas"
            action="Novo compromisso"
            onAction={() => openModal("event")}
          />
          {upcoming.length ? (
            upcoming.slice(0, 6).map((event) => (
              <div className="alert-item" key={event.id}>
                <span>◌</span>
                <div>
                  <strong>{event.title}</strong>
                  <small>
                    {niceDate(event.startsAt, true)} · {event.reminderMinutes}{" "}
                    min antes
                  </small>
                </div>
              </div>
            ))
          ) : (
            <Empty text="Seus próximos lembretes aparecerão aqui." />
          )}
        </section>
      </div>
    </PageFrame>
  );
}

const attachmentLabel = (type) =>
  ({
    link: "Link",
    imagem: "Imagem",
    certificado: "Certificado",
    arquivo: "Arquivo",
  })[type] || "Arquivo";
const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function SubjectMaterialsModal({ subject, data, planner, close }) {
  const [link, setLink] = useState({ title: "", url: "" });
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState({});
  const attachments = data.attachments.filter(
    (attachment) => attachment.subjectId === subject.id,
  );

  useEffect(() => {
    let active = true;
    async function loadPreviews() {
      const images = attachments.filter(
        (attachment) => attachment.type === "imagem" && attachment.storagePath,
      );
      const resolved = await Promise.all(
        images.map(async (attachment) => [
          attachment.id,
          await planner.getStudyAttachmentUrl(attachment),
        ]),
      );
      if (active) {
        setPreviews(
          Object.fromEntries(resolved.filter(([, url]) => Boolean(url))),
        );
      }
    }
    loadPreviews();
    return () => {
      active = false;
    };
  }, [attachments.length, subject.id]);

  async function addLink(event) {
    event.preventDefault();
    setBusy(true);
    const result = await planner.addStudyLink(subject.id, link);
    setBusy(false);
    if (result) setLink({ title: "", url: "" });
  }
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    await planner.uploadStudyAttachment(subject.id, file);
    setBusy(false);
  }
  async function openAttachment(attachment) {
    const url = await planner.getStudyAttachmentUrl(attachment);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="modal materials-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Materiais de ${subject.name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={close} aria-label="Fechar">
          ×
        </button>
        <header className="modal-heading">
          <span className="modal-mark">M</span>
          <div>
            <span className="eyebrow">BIBLIOTECA DA MATÉRIA</span>
            <h2>{subject.name}</h2>
            <p>Reúna certificados, imagens e referências em um único lugar.</p>
          </div>
        </header>
        <div className="material-actions">
          <label className="material-upload">
            <input
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={upload}
              type="file"
            />
            <span>＋</span>
            <strong>{busy ? "Enviando…" : "Adicionar arquivo"}</strong>
            <small>PDF, JPG, PNG ou WEBP · até 10 MB</small>
          </label>
          <form className="material-link-form" onSubmit={addLink}>
            <label>
              Link de referência
              <input
                required
                type="url"
                value={link.url}
                onChange={(event) =>
                  setLink({ ...link, url: event.target.value })
                }
                placeholder="https://..."
              />
            </label>
            <label>
              Nome do material <small>(opcional)</small>
              <input
                value={link.title}
                onChange={(event) =>
                  setLink({ ...link, title: event.target.value })
                }
                placeholder="Ex.: Aula complementar"
              />
            </label>
            <button className="button ghost" disabled={busy} type="submit">
              Salvar link
            </button>
          </form>
        </div>
        <section className="materials-list" aria-live="polite">
          <div className="materials-list-head">
            <span>Materiais anexados</span>
            <small>{attachments.length}</small>
          </div>
          {attachments.length ? (
            attachments.map((attachment) => (
              <article className="material-item" key={attachment.id}>
                {previews[attachment.id] ? (
                  <img alt="Prévia do material" src={previews[attachment.id]} />
                ) : (
                  <span className={`material-type ${attachment.type}`}>
                    {attachment.type === "link" ? "↗" : "▣"}
                  </span>
                )}
                <div>
                  <strong>{attachment.title}</strong>
                  <small>
                    {attachmentLabel(attachment.type)}
                    {attachment.sizeBytes
                      ? ` · ${formatFileSize(attachment.sizeBytes)}`
                      : ""}
                  </small>
                </div>
                <div className="item-actions">
                  <button
                    className="edit"
                    onClick={() => openAttachment(attachment)}
                    type="button"
                  >
                    Abrir
                  </button>
                  <button
                    className="delete"
                    onClick={() => planner.removeStudyAttachment(attachment)}
                    type="button"
                    aria-label="Excluir material"
                  >
                    ×
                  </button>
                </div>
              </article>
            ))
          ) : (
            <p className="materials-empty">
              Ainda não há materiais. Anexe o primeiro para começar sua
              biblioteca.
            </p>
          )}
        </section>
      </section>
    </div>
  );
}

function MfaChallenge({ factor, onVerified }) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function verify(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challengeError) {
      setMessage(challengeError.message);
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    await supabase.auth.refreshSession();
    setBusy(false);
    onVerified();
  }
  return (
    <main className="mfa-page">
      <section className="mfa-card">
        <Brand />
        <span className="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span>
        <h1>Confirme que é você.</h1>
        <p>
          Abra seu aplicativo autenticador e informe o código de seis dígitos
          para continuar.
        </p>
        <form onSubmit={verify}>
          <label>
            Código de autenticação
            <input
              autoComplete="one-time-code"
              autoFocus
              inputMode="numeric"
              maxLength="6"
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, ""))
              }
              pattern="[0-9]{6}"
              placeholder="000000"
              required
              value={code}
            />
          </label>
          {message && <p className="form-message">{message}</p>}
          <button className="button primary wide" disabled={busy}>
            {busy ? "Verificando…" : "Confirmar acesso"}
          </button>
        </form>
      </section>
    </main>
  );
}

function MfaGate({ auth, children }) {
  const [state, setState] = useState({
    loading: true,
    factor: null,
    error: "",
  });
  useEffect(() => {
    let active = true;
    async function check() {
      const [factorResult, assuranceResult] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (!active) return;
      if (factorResult.error || assuranceResult.error) {
        setState({
          loading: false,
          factor: null,
          error:
            factorResult.error?.message ||
            assuranceResult.error?.message ||
            "Não foi possível verificar a segurança da conta.",
        });
        return;
      }
      const factors = [
        ...(factorResult.data.totp || []),
        ...(factorResult.data.phone || []),
      ];
      const factor = factors.find((item) => item.status === "verified");
      const level = assuranceResult.data;
      if (factor && level.currentLevel !== "aal2") {
        setState({ loading: false, factor, error: "" });
        return;
      }
      setState({ loading: false, factor: null, error: "" });
    }
    check();
    return () => {
      active = false;
    };
  }, [auth.user?.id]);
  if (state.loading)
    return <div className="loading full">Verificando sua conta…</div>;
  if (state.factor) {
    return (
      <MfaChallenge
        factor={state.factor}
        onVerified={() => setState({ loading: false, factor: null, error: "" })}
      />
    );
  }
  if (state.error) {
    return (
      <main className="mfa-page">
        <section className="mfa-card">
          <Brand />
          <span className="eyebrow">ACESSO PROTEGIDO</span>
          <h1>Não foi possível validar a segurança.</h1>
          <p>{state.error}</p>
          <button className="button primary wide" onClick={auth.signOut}>
            Sair da conta
          </button>
        </section>
      </main>
    );
  }
  return children;
}

function Account({ auth, data, planner }) {
  const [name, setName] = useState(data.profile.displayName);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [factors, setFactors] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const loadFactors = async () => {
    const { data: factorData, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setMessage(error.message);
      return [];
    }
    const next = [...(factorData.totp || []), ...(factorData.phone || [])];
    setFactors(next);
    return next;
  };
  useEffect(() => {
    setName(data.profile.displayName);
  }, [data.profile.displayName]);
  useEffect(() => {
    loadFactors();
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    await planner.saveProfile({
      ...data.profile,
      displayName: name.trim() || "Minha conta",
    });
    setBusy(false);
    setMessage("Dados da conta atualizados.");
  }
  async function changePassword(event) {
    event.preventDefault();
    if (password.length < 8) {
      setMessage("A senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setMessage(error.message);
    else {
      setPassword("");
      setConfirmPassword("");
      setMessage("Senha atualizada com segurança.");
    }
  }
  async function startEnrollment() {
    setBusy(true);
    setMessage("");
    const { data: factor, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Moletas",
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: factor.id });
    setBusy(false);
    if (challengeError) {
      setMessage(challengeError.message);
      return;
    }
    setEnrollment({ ...factor, challengeId: challenge.id });
  }
  async function verifyEnrollment(event) {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollment.id,
      challengeId: enrollment.challengeId,
      code: code.trim(),
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    await supabase.auth.refreshSession();
    const result = await planner.setMfaRequired(true);
    setBusy(false);
    if (result === null) return;
    setEnrollment(null);
    setCode("");
    setMessage("MFA ativado. Seu próximo acesso pedirá o código autenticador.");
    await loadFactors();
  }
  async function removeFactor(factor) {
    setBusy(true);
    const disabled = await planner.setMfaRequired(false);
    if (disabled === null) {
      setBusy(false);
      return;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) {
      await planner.setMfaRequired(true);
      setMessage(error.message);
      return;
    }
    setMessage("MFA desativado para esta conta.");
    await loadFactors();
  }
  const verifiedFactors = factors.filter(
    (factor) => factor.status === "verified",
  );

  return (
    <PageFrame
      eyebrow="IDENTIDADE E SEGURANÇA"
      title="Sua conta"
      copy="Controle seus dados de acesso e mantenha a sua organização protegida."
    >
      <div className="account-grid">
        <section className="panel account-card">
          <SectionTitle title="Perfil" />
          <form onSubmit={saveProfile}>
            <label>
              Nome de exibição
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <label>
              E-mail da conta
              <input value={auth.user.email} disabled readOnly type="email" />
            </label>
            <button className="button ghost" disabled={busy}>
              Salvar perfil
            </button>
          </form>
        </section>
        <section className="panel account-card">
          <SectionTitle title="Senha" />
          <form onSubmit={changePassword}>
            <label>
              Nova senha
              <input
                autoComplete="new-password"
                minLength="8"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                autoComplete="new-password"
                minLength="8"
                onChange={(event) => setConfirmPassword(event.target.value)}
                type="password"
                value={confirmPassword}
              />
            </label>
            <button className="button ghost" disabled={busy || !password}>
              Atualizar senha
            </button>
          </form>
        </section>
      </div>
      <section className="panel mfa-settings">
        <div className="mfa-settings-head">
          <div>
            <span className="eyebrow">VERIFICAÇÃO EM DUAS ETAPAS</span>
            <h2>MFA por aplicativo autenticador</h2>
            <p>
              Use Google Authenticator, 1Password, Authy ou outro aplicativo
              compatível com TOTP.
            </p>
          </div>
          <span
            className={`security-state ${data.profile.mfaRequired ? "on" : ""}`}
          >
            {data.profile.mfaRequired ? "Protegida" : "Opcional"}
          </span>
        </div>
        {message && <p className="account-message">{message}</p>}
        {enrollment ? (
          <div className="mfa-enrollment">
            <div>
              <span className="eyebrow">ETAPA 1</span>
              <h3>Escaneie o QR code</h3>
              <p>
                Adicione a conta ao seu aplicativo autenticador antes de
                confirmar o código.
              </p>
              <code>{enrollment.totp.secret}</code>
            </div>
            {enrollment.totp.qr_code && (
              <img
                alt="QR code para configurar MFA"
                src={enrollment.totp.qr_code}
              />
            )}
            <form onSubmit={verifyEnrollment}>
              <label>
                Código de seis dígitos
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength="6"
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  required
                  value={code}
                />
              </label>
              <button className="button primary" disabled={busy}>
                Ativar MFA
              </button>
            </form>
          </div>
        ) : verifiedFactors.length ? (
          <div className="mfa-factor-list">
            {verifiedFactors.map((factor) => (
              <article key={factor.id}>
                <span>✓</span>
                <div>
                  <strong>
                    {factor.friendly_name || "Aplicativo autenticador"}
                  </strong>
                  <small>Verificado e pronto para proteger esta conta.</small>
                </div>
                <div className="item-actions">
                  {!data.profile.mfaRequired && (
                    <button
                      className="edit"
                      disabled={busy}
                      onClick={() => planner.setMfaRequired(true)}
                      type="button"
                    >
                      Exigir MFA
                    </button>
                  )}
                  <button
                    className="delete"
                    disabled={busy}
                    onClick={() => removeFactor(factor)}
                    type="button"
                  >
                    Remover
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mfa-empty">
            <div>
              <strong>Adicione uma camada extra de proteção.</strong>
              <p>
                Depois da ativação, a Moletas pedirá um código ao entrar na sua
                conta.
              </p>
            </div>
            <button
              className="button primary"
              disabled={busy}
              onClick={startEnrollment}
              type="button"
            >
              Configurar MFA
            </button>
          </div>
        )}
      </section>
    </PageFrame>
  );
}

function PageFrame({ eyebrow, title, copy, action, onAction, children }) {
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          {copy && <p>{copy}</p>}
        </div>
        {action && (
          <button className="button primary" onClick={onAction}>
            ＋ {action}
          </button>
        )}
      </div>
      {children}
    </>
  );
}

const defaults = {
  event: {
    title: "",
    date: today(),
    time: "09:00",
    category: "Pessoal",
    reminderMinutes: 15,
    notes: "",
    recurrence: "none",
    recurrenceUntil: "",
  },
  task: {
    title: "",
    dueDate: today(),
    category: "Pessoal",
    priority: true,
    durationMinutes: "",
  },
  note: { title: "", content: "", pinned: false },
  subject: { name: "", color: colors[0], targetMinutes: 180 },
  study: { subjectId: "", minutes: 45, notes: "" },
  path: { subjectId: "", title: "", description: "" },
  topic: { pathId: "", title: "", resourceUrl: "", notes: "" },
  habit: {
    name: "",
    frequency: ["Seg", "Ter", "Qua", "Qui", "Sex"],
    target: 1,
  },
  meal: {
    title: "",
    date: today(),
    type: "Café da manhã",
    time: "07:30",
    notes: "",
  },
  workout: {
    name: "",
    bodyPart: "Corpo inteiro",
    duration: 45,
    days: ["Seg", "Qui"],
  },
};

function modalForm(type, initial, data, preset = {}) {
  if (initial) {
    const fields = {
      event: {
        title: initial.title,
        date: dateInput(initial.startsAt),
        time: timeInput(initial.startsAt),
        category: initial.category,
        reminderMinutes: initial.reminderMinutes,
        notes: initial.notes || "",
      },
      task: {
        title: initial.title,
        dueDate: initial.dueDate || "",
        category: initial.category,
        priority: initial.priority,
        durationMinutes: initial.durationMinutes || "",
      },
      note: {
        title: initial.title,
        content: initial.content || "",
        pinned: initial.pinned,
      },
      subject: initial,
      path: { ...initial, subjectId: initial.subjectId || "" },
      topic: {
        ...initial,
        pathId: initial.pathId,
        resourceUrl: initial.resourceUrl || "",
      },
      habit: initial,
      meal: {
        title: initial.title,
        date: initial.date,
        type: initial.type,
        time: initial.time || "",
        notes: initial.notes || "",
      },
      workout: { ...initial, bodyPart: initial.bodyPart || initial.focus },
    };
    return { ...defaults[type], ...fields[type] };
  }
  return {
    ...defaults[type],
    ...(type === "study" && data.subjects[0]
      ? { subjectId: data.subjects[0].id }
      : type === "topic" && data.studyPaths[0]
        ? { pathId: data.studyPaths[0].id }
        : {}),
    ...preset,
  };
}

function PlannerModal({ type, initial, preset, close, planner, data }) {
  const [form, setForm] = useState(() =>
    modalForm(type, initial, data, preset),
  );
  const isEditing = Boolean(initial?.id);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const title = {
    event: isEditing ? "Editar compromisso" : "Novo compromisso",
    task: isEditing ? "Editar tarefa" : "Nova tarefa",
    note: isEditing ? "Editar nota" : "Nova nota",
    subject: isEditing ? "Editar matéria" : "Nova matéria",
    study: "Registrar estudo",
    path: isEditing ? "Editar trilha de estudo" : "Nova trilha de estudo",
    topic: isEditing ? "Editar tópico" : "Novo tópico",
    habit: isEditing ? "Editar hábito" : "Novo hábito",
    meal: isEditing ? "Editar refeição" : "Nova refeição",
    workout: isEditing ? "Editar treino" : "Novo treino",
  }[type];
  const description = {
    event: "Dê um horário ao que merece sua atenção.",
    task: "Transforme uma intenção em um próximo passo claro.",
    note: "Capture agora para lembrar no momento certo.",
    subject: "Comece uma área para concentrar materiais e progresso.",
    study: "Registre o tempo que você dedicou ao aprendizado.",
    path: "Organize uma sequência contínua de aprendizado.",
    topic: "Inclua uma etapa concreta na sua trilha.",
    habit: "Escolha um pequeno acordo que se repete na semana.",
    meal: "Planeje o que você quer comer e deixe o dia mais simples.",
    workout: "Defina onde o movimento entra na sua rotina.",
  }[type];
  const set = (patch) => setForm((value) => ({ ...value, ...patch }));
  async function submit(event) {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    const createOperations = {
      event: planner.addEvent,
      task: planner.addTask,
      note: planner.addNote,
      subject: planner.addSubject,
      study: planner.addStudy,
      path: planner.addStudyPath,
      topic: planner.addStudyTopic,
      habit: planner.addHabit,
      meal: planner.addMeal,
      workout: planner.addWorkout,
    };
    const updateOperations = {
      event: planner.updateEvent,
      task: planner.updateTaskDetails,
      note: planner.updateNote,
      subject: planner.updateSubject,
      path: planner.updateStudyPath,
      topic: planner.updateStudyTopic,
      habit: planner.updateHabit,
      meal: planner.updateMeal,
      workout: planner.updateWorkout,
    };
    let result;
    try {
      const forms =
        type === "event" && !isEditing
          ? generateEventOccurrences(form)
          : [form];
      result = isEditing
        ? await updateOperations[type](initial.id, form)
        : type === "event"
          ? await planner.addEvents(forms)
          : await createOperations[type](form);
    } catch (reason) {
      setBusy(false);
      setFormError(reason.message || "Não foi possível criar os compromissos.");
      return;
    }
    setBusy(false);
    if (result !== null) close();
  }
  const toggleDay = (field, day) =>
    set({
      [field]: form[field].includes(day)
        ? form[field].filter((item) => item !== day)
        : [...form[field], day],
    });
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={close} aria-label="Fechar">
          ×
        </button>
        <header className="modal-heading">
          <span className="modal-mark">{isEditing ? "↺" : "+"}</span>
          <div>
            <span className="eyebrow">
              {isEditing ? "AJUSTAR REGISTRO" : "NOVO REGISTRO"}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </header>
        <form onSubmit={submit}>
          {type === "event" && (
            <>
              <label>
                Título
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex.: Consulta, reunião, aniversário"
                />
              </label>
              <div className="form-grid">
                <label>
                  Data
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => set({ date: e.target.value })}
                  />
                </label>
                <label>
                  Horário
                  <input
                    type="time"
                    required
                    value={form.time}
                    onChange={(e) => set({ time: e.target.value })}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Categoria
                  <select
                    value={form.category}
                    onChange={(e) => set({ category: e.target.value })}
                  >
                    {["Pessoal", "Trabalho", "Estudos", "Saúde"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Alertar antes
                  <select
                    value={form.reminderMinutes}
                    onChange={(e) => set({ reminderMinutes: e.target.value })}
                  >
                    {[
                      [0, "Sem alerta"],
                      [5, "5 min"],
                      [15, "15 min"],
                      [30, "30 min"],
                      [60, "1 hora"],
                      [1440, "1 dia"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!isEditing && (
                <fieldset className="recurrence-control">
                  <legend>Repetição</legend>
                  <div className="form-grid">
                    <label>
                      Repetir
                      <select
                        value={form.recurrence}
                        onChange={(e) => set({ recurrence: e.target.value })}
                      >
                        <option value="none">Não repetir</option>
                        <option value="daily">Todos os dias</option>
                        <option value="weekdays">Nos dias úteis</option>
                        <option value="weekly">Toda semana</option>
                        <option value="monthly">Todo mês</option>
                      </select>
                    </label>
                    {form.recurrence !== "none" && (
                      <label>
                        Repetir até
                        <input
                          type="date"
                          min={form.date}
                          required
                          value={form.recurrenceUntil}
                          onChange={(e) =>
                            set({ recurrenceUntil: e.target.value })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {form.recurrence !== "none" && (
                    <p className="recurrence-note">
                      {form.recurrenceUntil
                        ? (() => {
                            try {
                              const total = generateEventOccurrences(form).length;
                              return `Serão criados ${total} compromissos: ${recurrenceCopy[form.recurrence].toLocaleLowerCase("pt-BR")}.`;
                            } catch (reason) {
                              return reason.message;
                            }
                          })()
                        : "Defina a data final para visualizar as ocorrências."}
                    </p>
                  )}
                </fieldset>
              )}
              <label>
                Detalhes
                <textarea
                  value={form.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  placeholder="O que você não pode esquecer?"
                />
              </label>
            </>
          )}
          {type === "task" && (
            <>
              <label>
                Tarefa
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="O que precisa ser feito?"
                />
              </label>
              <div className="form-grid">
                <label>
                  Prazo
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => set({ dueDate: e.target.value })}
                  />
                </label>
                <label>
                  Área
                  <select
                    value={form.category}
                    onChange={(e) => set({ category: e.target.value })}
                  >
                    {["Pessoal", "Trabalho", "Estudos", "Casa"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Duração do foco (minutos)
                <input
                  type="number"
                  min="1"
                  max="480"
                  inputMode="numeric"
                  value={form.durationMinutes}
                  onChange={(e) => set({ durationMinutes: e.target.value })}
                  placeholder="Ex.: 20"
                />
                <small className="field-help">
                  Opcional. Ao informar uma duração, você poderá iniciar um
                  cronômetro nesta tarefa.
                </small>
              </label>
              <label className="check-label choice-card">
                <input
                  type="checkbox"
                  checked={form.priority}
                  onChange={(e) => set({ priority: e.target.checked })}
                />
                <span className="choice-indicator">✓</span>
                <span>
                  <strong>Prioridade do dia</strong>
                  <small>Coloque esta tarefa no seu foco principal.</small>
                </span>
              </label>
            </>
          )}
          {type === "note" && (
            <>
              <label>
                Título
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex.: Ideias para a semana"
                />
              </label>
              <label>
                Conteúdo
                <textarea
                  value={form.content}
                  onChange={(e) => set({ content: e.target.value })}
                  placeholder="Anote o que precisa guardar, lembrar ou desenvolver depois."
                />
              </label>
              <label className="check-label choice-card">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => set({ pinned: e.target.checked })}
                />
                <span className="choice-indicator">✓</span>
                <span>
                  <strong>Fixar no topo</strong>
                  <small>Mantenha esta nota sempre visível.</small>
                </span>
              </label>
            </>
          )}
          {type === "subject" && (
            <>
              <label>
                Nome da matéria
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Ex.: Inglês, Biologia, Direito"
                />
              </label>
              <div className="form-grid">
                <label>
                  Meta semanal (min)
                  <input
                    type="number"
                    min="15"
                    value={form.targetMinutes}
                    onChange={(e) => set({ targetMinutes: e.target.value })}
                  />
                </label>
                <label>
                  Cor
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => set({ color: e.target.value })}
                  />
                </label>
              </div>
            </>
          )}
          {type === "study" && (
            <>
              <>
                <label>
                  Matéria
                  <select
                    value={form.subjectId}
                    onChange={(e) => set({ subjectId: e.target.value })}
                  >
                    {data.subjects.map((subject) => (
                      <option value={subject.id} key={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Duração (min)
                  <input
                    type="number"
                    min="5"
                    value={form.minutes}
                    onChange={(e) => set({ minutes: e.target.value })}
                  />
                </label>
                <label>
                  Anotação (opcional)
                  <textarea
                    value={form.notes}
                    onChange={(e) => set({ notes: e.target.value })}
                    placeholder="No que você trabalhou?"
                  />
                </label>
              </>
            </>
          )}
          {type === "path" && (
            <>
              <label>
                Nome da trilha
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex.: Espanhol essencial · A1"
                />
              </label>
              <label>
                Matéria (opcional)
                <select
                  value={form.subjectId}
                  onChange={(e) => set({ subjectId: e.target.value })}
                >
                  <option value="">Estudo livre</option>
                  {data.subjects.map((subject) => (
                    <option value={subject.id} key={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Objetivo da trilha
                <textarea
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="O que você deseja alcançar ao concluir esta sequência?"
                />
              </label>
            </>
          )}
          {type === "topic" && (
            <>
              <label>
                Trilha
                <select
                  required
                  value={form.pathId}
                  onChange={(e) => set({ pathId: e.target.value })}
                >
                  {data.studyPaths.map((path) => (
                    <option value={path.id} key={path.id}>
                      {path.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tópico
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder="Ex.: Verbos no presente"
                />
              </label>
              <label>
                Link do material (opcional)
                <input
                  type="url"
                  value={form.resourceUrl}
                  onChange={(e) => set({ resourceUrl: e.target.value })}
                  placeholder="https://..."
                />
                <small className="field-help">
                  Use um link HTTP ou HTTPS para abrir o material em uma nova
                  aba.
                </small>
              </label>
              <label>
                Anotações (opcional)
                <textarea
                  value={form.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                  placeholder="O que revisar, praticar ou produzir neste tópico?"
                />
              </label>
            </>
          )}
          {type === "habit" && (
            <>
              <label>
                Nome do hábito
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Ex.: Beber água, meditar"
                />
              </label>
              <label>
                Meta diária
                <input
                  type="number"
                  min="1"
                  value={form.target}
                  onChange={(e) => set({ target: e.target.value })}
                />
              </label>
              <DayPicker
                selected={form.frequency}
                onToggle={(day) => toggleDay("frequency", day)}
              />
            </>
          )}
          {type === "meal" && (
            <>
              <label>
                Refeição ou alimentos
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(event) => set({ title: event.target.value })}
                  placeholder="Ex.: Arroz, frango e salada"
                />
              </label>
              <div className="form-grid">
                <label>
                  Dia
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(event) => set({ date: event.target.value })}
                  />
                </label>
                <label>
                  Horário
                  <input
                    type="time"
                    value={form.time}
                    onChange={(event) => set({ time: event.target.value })}
                  />
                </label>
              </div>
              <label>
                Momento do dia
                <select
                  value={form.type}
                  onChange={(event) => set({ type: event.target.value })}
                >
                  {mealSlots.map((slot) => (
                    <option key={slot.name}>{slot.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Observações (opcional)
                <textarea
                  value={form.notes}
                  onChange={(event) => set({ notes: event.target.value })}
                  placeholder="Ex.: Sem lactose, preparar na noite anterior ou incluir fruta."
                />
              </label>
            </>
          )}
          {type === "workout" && (
            <>
              <label>
                Nome do treino
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Ex.: Corrida leve"
                />
              </label>
              <div className="form-grid">
                <label>
                  Grupo muscular ou parte do corpo
                  <select
                    required
                    value={form.bodyPart}
                    onChange={(e) => set({ bodyPart: e.target.value })}
                  >
                    {[
                      "Corpo inteiro",
                      "Peito",
                      "Costas",
                      "Pernas",
                      "Ombros",
                      "Braços",
                      "Core",
                      "Cardio",
                      "Mobilidade",
                    ].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Duração (min)
                  <input
                    type="number"
                    min="5"
                    value={form.duration}
                    onChange={(e) => set({ duration: e.target.value })}
                  />
                </label>
              </div>
              <DayPicker
                selected={form.days}
                onToggle={(day) => toggleDay("days", day)}
              />
            </>
          )}
          {formError && <p className="form-message">{formError}</p>}
          <button className="button primary wide" disabled={busy}>
            {busy ? "Salvando…" : isEditing ? "Salvar alterações" : "Salvar"}
          </button>
        </form>
      </section>
    </div>
  );
}
function DayPicker({ selected, onToggle }) {
  return (
    <fieldset className="day-picker">
      <legend>Dias da semana</legend>
      <div>
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
          <button
            type="button"
            className={selected.includes(day) ? "selected" : ""}
            aria-pressed={selected.includes(day)}
            key={day}
            onClick={() => onToggle(day)}
          >
            <span>{day}</span>
            <i>{selected.includes(day) ? "✓" : "+"}</i>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function AppShell({ auth, planner }) {
  const [page, setPage] = useState("overview");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("moletas-theme") || "light",
  );
  const [modal, setModal] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const openModal = (request) =>
    setModal(typeof request === "string" ? { type: request } : request);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("moletas-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#10201d" : "#0c7b72");
  }, [theme]);
  const content = {
    overview: (
      <Dashboard data={planner.data} planner={planner} openModal={openModal} />
    ),
    agenda: (
      <Agenda data={planner.data} planner={planner} openModal={openModal} />
    ),
    tasks: (
      <Tasks data={planner.data} planner={planner} openModal={openModal} />
    ),
    notes: (
      <Notes data={planner.data} planner={planner} openModal={openModal} />
    ),
    study: (
      <Study data={planner.data} planner={planner} openModal={openModal} />
    ),
    routine: (
      <Routine data={planner.data} planner={planner} openModal={openModal} />
    ),
    nutrition: (
      <Nutrition data={planner.data} planner={planner} openModal={openModal} />
    ),
    workouts: (
      <Workouts data={planner.data} planner={planner} openModal={openModal} />
    ),
    alerts: (
      <Alerts data={planner.data} planner={planner} openModal={openModal} />
    ),
    account: <Account auth={auth} data={planner.data} planner={planner} />,
  }[page];
  const mobilePrimaryItems = navItems.filter(([id]) =>
    ["overview", "agenda", "tasks", "study"].includes(id),
  );
  const mobileExtraItems = navItems.filter(
    ([id]) => !mobilePrimaryItems.some(([primaryId]) => primaryId === id),
  );
  const syncMessage = planner.syncing
    ? "Salvando alterações…"
    : planner.error ||
      (auth.configured
        ? "Sincronizado com segurança"
        : "Conexão com Supabase pendente");
  const syncTone = planner.error ? "error" : planner.syncing ? "pending" : "ready";
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <div className="workspace">PLANEJAMENTO PESSOAL</div>
        <nav>
          {navItems.map(([id, label, icon]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => setPage(id)}
            >
              <NavIcon name={icon} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-mini">
            <span>
              {planner.data.profile.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{planner.data.profile.displayName}</strong>
              <small>Conta protegida</small>
            </div>
          </div>
          <button className="sign-out" onClick={auth.signOut}>
            Sair da conta
          </button>
        </div>
      </aside>
      <header className="topbar">
        <div className="mobile-logo">
          <Brand compact />
        </div>
        <p className={`sync-status ${syncTone}`} title={syncMessage}>
          <span aria-hidden="true"></span>
          {syncMessage}
        </p>
        <div>
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Alternar tema"
          >
            <ThemeIcon theme={theme} />
          </button>
          {page !== "account" && (
            <button
              className="button primary add-button"
              onClick={() =>
                openModal(
                  page === "study"
                    ? "path"
                    : page === "notes"
                      ? "note"
                      : page === "workouts"
                        ? "workout"
                        : page === "routine"
                          ? "habit"
                          : page === "nutrition"
                            ? "meal"
                            : page === "agenda"
                              ? "event"
                              : "task",
                )
              }
            >
              <span className="add-icon" aria-hidden="true">+</span> <span>Novo</span>
            </button>
          )}
        </div>
      </header>
      <main className="main">
        {planner.loading ? (
          <div className="loading">Organizando o seu espaço…</div>
        ) : (
          content
        )}
      </main>
      <nav className="mobile-nav" aria-label="Navegação principal">
        {mobilePrimaryItems.map(([id, label, icon]) => (
          <button
            className={page === id ? "active" : ""}
            key={id}
            onClick={() => {
              setPage(id);
              setMobileMenuOpen(false);
            }}
          >
            <NavIcon name={icon} />
            <small>{label}</small>
          </button>
        ))}
        <button
          aria-controls="mobile-more-menu"
          aria-expanded={mobileMenuOpen}
          className={mobileExtraItems.some(([id]) => page === id) ? "active" : ""}
          onClick={() => setMobileMenuOpen((open) => !open)}
          type="button"
        >
          <NavIcon name="more" />
          <small>Mais</small>
        </button>
      </nav>
      {mobileMenuOpen && (
        <div
          className="mobile-menu-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          role="presentation"
        >
          <section
            aria-label="Mais áreas do Moletas"
            className="mobile-menu"
            id="mobile-more-menu"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-menu-head">
              <div>
                <span className="eyebrow">MOLETAS</span>
                <strong>Mais áreas</strong>
              </div>
              <button
                aria-label="Fechar menu"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="mobile-menu-grid">
              {mobileExtraItems.map(([id, label, icon]) => (
                <button
                  className={page === id ? "active" : ""}
                  key={id}
                  onClick={() => {
                    setPage(id);
                    setMobileMenuOpen(false);
                  }}
                  type="button"
                >
                  <NavIcon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {modal?.type === "materials" ? (
        <SubjectMaterialsModal
          close={() => setModal(null)}
          data={planner.data}
          planner={planner}
          subject={modal.initial}
        />
      ) : (
        modal && (
          <PlannerModal
            type={modal.type}
            initial={modal.initial}
            preset={modal.preset}
            data={planner.data}
            planner={planner}
            close={() => setModal(null)}
          />
        )
      )}
    </div>
  );
}

function Dashboard({ data, openModal, planner }) {
  const tasksToday = data.tasks.filter(
    (task) => !task.dueDate || task.dueDate === today(),
  );
  const doneToday = tasksToday.filter((task) => task.completedAt).length;
  const priorities = tasksToday.filter((task) => task.priority);
  const start = mondayOf();
  const studyMinutes = data.studySessions
    .filter((session) => new Date(session.startedAt) >= start)
    .reduce((total, session) => total + session.minutes, 0);
  const workoutCount = data.workoutSessions.filter(
    (session) => new Date(session.completedAt) >= start,
  ).length;
  const eventCount = data.events.filter(
    (event) => new Date(event.startsAt) >= start,
  ).length;
  const balance = [
    ["Agenda", eventCount, "violet"],
    ["Execução", doneToday, "aqua"],
    ["Estudos", Math.round(studyMinutes / 30), "amber"],
    ["Movimento", workoutCount, "rose"],
  ];
  return (
    <>
      <section className="daily-brief">
        <div>
          <span className="eyebrow">SEU DIA EM FOCO</span>
          <h1>
            {new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(
              new Date(),
            )}
            , {data.profile.displayName.split(" ")[0]}.
          </h1>
          <p>
            {priorities.length
              ? `Você tem ${priorities.length} prioridade${priorities.length > 1 ? "s" : ""} para conduzir hoje.`
              : "Seu foco está aberto. Escolha uma direção para começar."}
          </p>
        </div>
        <div className="daily-brief-actions">
          <button className="button ghost" onClick={() => openModal("event")}>
            ＋ Compromisso
          </button>
          <button className="button primary" onClick={() => openModal("task")}>
            ＋ Prioridade
          </button>
        </div>
      </section>
      <div className="market-stats">
        <Stat
          value={`${doneToday}/${tasksToday.length || 0}`}
          label="Acordos concluídos hoje"
        />
        <Stat
          value={`${studyMinutes}m`}
          label="Estudo com intenção"
          accent="blue"
        />
        <Stat
          value={workoutCount}
          label="Sessões de movimento"
          accent="green"
        />
        <Stat
          value={`${Math.min(100, Math.round(((doneToday * 2 + studyMinutes / 30 + workoutCount * 2) / 10) * 100))}%`}
          label="Energia bem distribuída"
          accent="orange"
        />
      </div>
      <WeekPerspective data={data} openModal={openModal} />
      <div className="market-lower-grid">
        <section className="panel focus-panel">
          <SectionTitle
            eyebrow="PRÓXIMA MELHOR AÇÃO"
            title="Para avançar hoje"
            action="Ver todas"
            onAction={() => openModal("task")}
          />
          {priorities.length ? (
            <div className="check-list">
              {priorities.slice(0, 4).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  planner={planner}
                  onToggle={() => planner.toggleTask(task)}
                />
              ))}
            </div>
          ) : (
            <Empty
              text="Seu foco está livre. Escolha uma prioridade que deixa o dia mais leve."
              action="Criar prioridade"
              onAction={() => openModal("task")}
            />
          )}
        </section>
        <section className="panel balance-panel">
          <SectionTitle
            eyebrow="PULSO DA SEMANA"
            title="Como está o equilíbrio"
          />
          <div className="balance-list">
            {balance.map(([label, value, tone]) => (
              <div className="balance-row" key={label}>
                <div>
                  <span className={`balance-icon ${tone}`}></span>
                  <strong>{label}</strong>
                </div>
                <div className="balance-track">
                  <i
                    className={tone}
                    style={{
                      width: `${Math.min(100, Math.max(8, value * 18))}%`,
                    }}
                  ></i>
                </div>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <p className="balance-tip">
            {eventCount
              ? "Sua semana já tem forma. Deixe pelo menos um espaço em branco para o imprevisto."
              : "Comece marcando só o essencial. Uma boa semana não precisa estar lotada."}
          </p>
        </section>
      </div>
    </>
  );
}

function Agenda({ data, openModal, planner }) {
  const events = [...data.events].sort(
    (a, b) => new Date(a.startsAt) - new Date(b.startsAt),
  );
  return (
    <PageFrame
      eyebrow="PLANEJAMENTO INTELIGENTE"
      title="Agenda"
      copy="Veja a semana primeiro — depois decida os detalhes de cada dia."
      action="Novo compromisso"
      onAction={() => openModal("event")}
    >
      <WeeklyPlanner data={data} openModal={openModal} />
      <div className="agenda-summary">
        <div>
          <span className="eyebrow">CAPACIDADE DA SEMANA</span>
          <strong>Compromissos: {events.length}</strong>
          <small>Distribua o essencial e preserve tempo para você.</small>
        </div>
        <div className="agenda-summary-mark">◫</div>
      </div>
      <section className="panel agenda-panel market-agenda-list">
        <SectionTitle
          eyebrow="PRÓXIMOS COMPROMISSOS"
          title="O que vem a seguir"
        />
        {events.length ? (
          <div className="event-list">
            {events.map((event) => (
              <article className="event-row" key={event.id}>
                <div className={`event-date ${event.category.toLowerCase()}`}>
                  <b>{new Date(event.startsAt).getDate()}</b>
                  <span>{weekday(event.startsAt)}</span>
                </div>
                <div>
                  <strong>{event.title}</strong>
                  <p>
                    {niceDate(event.startsAt, true)} · {event.category}
                  </p>
                  {event.notes && <small>{event.notes}</small>}
                </div>
                <span className="reminder">◌ {event.reminderMinutes} min</span>
                <button
                  className="edit"
                  onClick={() => openModal({ type: "event", initial: event })}
                  aria-label="Editar compromisso"
                >
                  Editar
                </button>
                <button
                  className="delete"
                  onClick={() => planner.removeEvent(event.id)}
                  aria-label="Excluir compromisso"
                >
                  ×
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            text="Comece pela primeira âncora da sua semana."
            action="Criar compromisso"
            onAction={() => openModal("event")}
          />
        )}
      </section>
      <section className="panel agenda-tasks-panel">
        <SectionTitle
          eyebrow="TAREFAS NA AGENDA"
          title="O que também tem prazo"
          action="Nova tarefa"
          onAction={() => openModal("task")}
        />
        {data.tasks.filter((task) => task.dueDate && !task.completedAt)
          .length ? (
          <div className="check-list">
            {data.tasks
              .filter((task) => task.dueDate && !task.completedAt)
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
              .slice(0, 6)
              .map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  planner={planner}
                  onToggle={() => planner.toggleTask(task)}
                  onEdit={() => openModal({ type: "task", initial: task })}
                />
              ))}
          </div>
        ) : (
          <Empty text="Nenhuma tarefa com prazo próximo." />
        )}
      </section>
    </PageFrame>
  );
}

export default function App() {
  const auth = useAuth();
  const planner = usePlanner(auth.user, !auth.configured);
  if (!auth.ready) return <div className="loading full">Carregando…</div>;
  if (!auth.user) return <AuthScreen auth={auth} />;
  return (
    <MfaGate auth={auth}>
      <AppShell auth={auth} planner={planner} />
    </MfaGate>
  );
}

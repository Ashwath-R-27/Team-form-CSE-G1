"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import GlassInput, { InputStatus } from "./GlassInput";
import GlassSelect from "./GlassSelect";
import SubmissionSuccess from "./SubmissionSuccess";
import {
  ApiClientError,
  checkRollNumber,
  checkTopicForForm,
  fetchPublicFormTopics,
  StudentMember,
  submitTeamForForm,
  SubmitTeamResult,
  TopicOption,
} from "@/lib/api";

interface MemberField {
  uid: string;
  value: string;
  status: InputStatus;
  error?: string;
  name?: string;
  gender?: "M" | "F";
}

interface TeamRegistrationFormProps {
  slug?: string;
  minTeamSize?: number;
  maxTeamSize?: number;
  collectTopic?: boolean;
  allowTopicRepeat?: boolean;
  hasTopicOptions?: boolean;
  formTitle?: string;
  onSubmitted?: () => void;
}

let uidCounter = 1;
const nextUid = () => `member-row-${uidCounter++}-${Math.random().toString(36).slice(2, 7)}`;

const createEmptyMembers = (count: number): MemberField[] =>
  Array.from({ length: count }, () => ({ uid: nextUid(), value: "", status: "idle" }));

export default function TeamRegistrationForm({
  slug = "default",
  minTeamSize = 3,
  maxTeamSize = 3,
  collectTopic = false,
  allowTopicRepeat = true,
  hasTopicOptions = false,
  formTitle,
  onSubmitted,
}: TeamRegistrationFormProps) {
  const prefersReducedMotion = useReducedMotion();
  const [members, setMembers] = useState<MemberField[]>(() => createEmptyMembers(minTeamSize));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitTeamResult | null>(null);

  // Topic state
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [freeTopic, setFreeTopic] = useState("");
  const [freeTopicStatus, setFreeTopicStatus] = useState<InputStatus>("idle");
  const [topicError, setTopicError] = useState<string | undefined>(undefined);

  const membersRef = useRef<MemberField[]>(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const topicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicAbortRef = useRef<AbortController | null>(null);

  // Keep member count within [minTeamSize, maxTeamSize] if form settings change
  useEffect(() => {
    setMembers((prev) => {
      if (prev.length < minTeamSize) {
        return [
          ...prev,
          ...Array.from({ length: minTeamSize - prev.length }, () => ({
            uid: nextUid(),
            value: "",
            status: "idle" as InputStatus,
          })),
        ];
      }
      if (prev.length > maxTeamSize) {
        return prev.slice(0, maxTeamSize);
      }
      return prev;
    });
  }, [minTeamSize, maxTeamSize]);

  // Load topic options when collectTopic && hasTopicOptions
  const loadTopics = useCallback(async () => {
    if (!collectTopic || !hasTopicOptions || !slug) return;
    try {
      const res = await fetchPublicFormTopics(slug);
      setTopicOptions(res.topics);
      // If currently selected topic just got taken while repeat is off, warn the user
      if (!allowTopicRepeat && selectedTopic) {
        const match = res.topics.find(
          (t) => t.name.toLowerCase() === selectedTopic.toLowerCase()
        );
        if (match?.taken) {
          setTopicError(`Taken by Team ${match.teamNo ?? ""}`.trim());
        }
      }
    } catch {
      // ignore transient error
    }
  }, [collectTopic, hasTopicOptions, slug, allowTopicRepeat, selectedTopic]);

  useEffect(() => {
    if (collectTopic && hasTopicOptions) {
      setLoadingTopics(true);
      loadTopics().finally(() => setLoadingTopics(false));
      const interval = setInterval(loadTopics, 5000);
      return () => clearInterval(interval);
    } else {
      setTopicOptions([]);
      setSelectedTopic(null);
    }
  }, [collectTopic, hasTopicOptions, loadTopics]);

  // Reset topic error if allowTopicRepeat turns on or collectTopic changes
  useEffect(() => {
    if (!collectTopic) {
      setTopicError(undefined);
      setFreeTopic("");
      setFreeTopicStatus("idle");
      setSelectedTopic(null);
    } else if (allowTopicRepeat) {
      setTopicError(undefined);
      if (freeTopic.trim()) {
        setFreeTopicStatus("valid");
      }
    } else if (!hasTopicOptions && freeTopic.trim()) {
      validateFreeTopic(freeTopic);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectTopic, allowTopicRepeat, hasTopicOptions]);

  useEffect(() => {
    const timers = timersRef.current;
    const controllers = abortControllersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(controllers).forEach((c) => c.abort());
      if (topicTimerRef.current) clearTimeout(topicTimerRef.current);
      if (topicAbortRef.current) topicAbortRef.current.abort();
    };
  }, []);

  function updateMemberByUid(uid: string, patch: Partial<MemberField>) {
    setMembers((prev) => prev.map((m) => (m.uid === uid ? { ...m, ...patch } : m)));
  }

  async function validateMember(uid: string, rawInput: string) {
    const raw = rawInput.trim().toUpperCase();
    if (!raw) {
      updateMemberByUid(uid, {
        status: "idle",
        error: undefined,
        name: undefined,
        gender: undefined,
      });
      return;
    }

    // 1. Check duplicate within current team
    const isDuplicateInTeam = membersRef.current.some(
      (m) => m.uid !== uid && m.value.trim().toUpperCase() === raw
    );

    if (isDuplicateInTeam) {
      updateMemberByUid(uid, {
        status: "invalid",
        error: "Duplicate in this team",
        name: undefined,
        gender: undefined,
      });
      return;
    }

    // 2. Call backend check-roll endpoint
    if (abortControllersRef.current[uid]) {
      abortControllersRef.current[uid].abort();
    }
    const controller = new AbortController();
    abortControllersRef.current[uid] = controller;

    updateMemberByUid(uid, { status: "checking", error: undefined });

    try {
      const res = await checkRollNumber(slug, raw, controller.signal);

      const currentField = membersRef.current.find((m) => m.uid === uid);
      if (!currentField || currentField.value.trim().toUpperCase() !== raw) {
        return;
      }

      const duplicateNow = membersRef.current.some(
        (m) => m.uid !== uid && m.value.trim().toUpperCase() === raw
      );
      if (duplicateNow) {
        updateMemberByUid(uid, {
          status: "invalid",
          error: "Duplicate in this team",
          name: undefined,
          gender: undefined,
        });
        return;
      }

      if (res.status === "not_found") {
        updateMemberByUid(uid, {
          status: "invalid",
          error: "Roll number not found",
          name: undefined,
          gender: undefined,
        });
      } else if (res.status === "taken") {
        updateMemberByUid(uid, {
          status: "warning",
          error: `Already registered in Team ${res.teamNo ?? ""}`.trim(),
          name: res.name,
          gender: res.gender,
        });
      } else {
        updateMemberByUid(uid, {
          status: "valid",
          error: undefined,
          name: res.name,
          gender: res.gender,
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      const currentField = membersRef.current.find((m) => m.uid === uid);
      if (!currentField || currentField.value.trim().toUpperCase() !== raw) return;
      updateMemberByUid(uid, {
        status: "invalid",
        error: "Could not verify roll number. Please try again.",
      });
    }
  }

  function handleRollChange(uid: string, rawValue: string) {
    const value = rawValue.toUpperCase().replace(/\s+/g, "");
    setSubmitError(null);

    const prevField = membersRef.current.find((m) => m.uid === uid);
    const prevValue = prevField?.value.trim().toUpperCase();

    const nextMembers = membersRef.current.map((m) =>
      m.uid === uid
        ? { ...m, value, status: "idle" as InputStatus, error: undefined, name: undefined, gender: undefined }
        : m
    );
    membersRef.current = nextMembers;
    setMembers(nextMembers);

    if (timersRef.current[uid]) {
      clearTimeout(timersRef.current[uid]);
    }

    // Re-validate any sibling that previously had "Duplicate in this team" on prevValue
    nextMembers.forEach((m) => {
      if (
        m.uid !== uid &&
        m.error === "Duplicate in this team" &&
        m.value.trim().toUpperCase() === prevValue
      ) {
        validateMember(m.uid, m.value);
      }
    });

    if (!value) return;

    const duplicate = nextMembers.some(
      (m) => m.uid !== uid && m.value.trim().toUpperCase() === value
    );
    if (duplicate) {
      updateMemberByUid(uid, {
        value,
        status: "invalid",
        error: "Duplicate in this team",
        name: undefined,
        gender: undefined,
      });
      return;
    }

    timersRef.current[uid] = setTimeout(() => {
      validateMember(uid, value);
    }, 400);
  }

  function handleRollBlur(uid: string) {
    const field = membersRef.current.find((m) => m.uid === uid);
    if (!field) return;
    const raw = field.value.trim().toUpperCase();
    if (!raw) return;

    if (timersRef.current[uid]) {
      clearTimeout(timersRef.current[uid]);
    }

    if (field.status === "idle") {
      validateMember(uid, raw);
    }
  }

  function handleAddMember() {
    if (members.length >= maxTeamSize) return;
    setMembers((prev) => [...prev, { uid: nextUid(), value: "", status: "idle" }]);
  }

  function handleRemoveMember(uid: string) {
    if (members.length <= minTeamSize) return;
    const removedField = membersRef.current.find((m) => m.uid === uid);
    const removedVal = removedField?.value.trim().toUpperCase();

    if (timersRef.current[uid]) clearTimeout(timersRef.current[uid]);
    if (abortControllersRef.current[uid]) abortControllersRef.current[uid].abort();

    const nextMembers = membersRef.current.filter((m) => m.uid !== uid);
    membersRef.current = nextMembers;
    setMembers(nextMembers);

    if (removedVal) {
      nextMembers.forEach((m) => {
        if (m.error === "Duplicate in this team" && m.value.trim().toUpperCase() === removedVal) {
          validateMember(m.uid, m.value);
        }
      });
    }
  }

  async function validateFreeTopic(rawTopicInput: string) {
    const normalized = rawTopicInput.trim().replace(/\s+/g, " ");
    if (!normalized) {
      setFreeTopicStatus("idle");
      setTopicError(undefined);
      return;
    }

    if (allowTopicRepeat) {
      setFreeTopicStatus("valid");
      setTopicError(undefined);
      return;
    }

    if (topicAbortRef.current) {
      topicAbortRef.current.abort();
    }
    const controller = new AbortController();
    topicAbortRef.current = controller;

    setFreeTopicStatus("checking");
    setTopicError(undefined);

    try {
      const res = await checkTopicForForm(slug, normalized, controller.signal);
      if (res.status === "taken") {
        setFreeTopicStatus("warning");
        setTopicError(`Topic already chosen by Team ${res.teamNo ?? ""}`.trim());
      } else {
        setFreeTopicStatus("valid");
        setTopicError(undefined);
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setFreeTopicStatus("invalid");
      setTopicError("Could not verify topic availability.");
    }
  }

  function handleFreeTopicChange(val: string) {
    setFreeTopic(val);
    setSubmitError(null);
    if (topicTimerRef.current) clearTimeout(topicTimerRef.current);

    const normalized = val.trim().replace(/\s+/g, " ");
    if (!normalized) {
      setFreeTopicStatus("idle");
      setTopicError(undefined);
      return;
    }

    if (allowTopicRepeat) {
      setFreeTopicStatus("valid");
      setTopicError(undefined);
      return;
    }

    setFreeTopicStatus("idle");
    setTopicError(undefined);
    topicTimerRef.current = setTimeout(() => {
      validateFreeTopic(val);
    }, 400);
  }

  function handleFreeTopicBlur() {
    if (!freeTopic.trim()) return;
    if (topicTimerRef.current) clearTimeout(topicTimerRef.current);
    if (freeTopicStatus === "idle") {
      validateFreeTopic(freeTopic);
    }
  }

  const allMembersValid =
    members.length >= minTeamSize &&
    members.length <= maxTeamSize &&
    members.every((m) => m.status === "valid" && !m.error && m.value.trim().length > 0);

  const isTopicValid = !collectTopic
    ? true
    : hasTopicOptions
    ? Boolean(
        selectedTopic &&
          !topicError &&
          (!topicOptions.find((t) => t.name === selectedTopic)?.taken || allowTopicRepeat)
      )
    : Boolean(
        freeTopic.trim().length > 0 &&
          freeTopicStatus === "valid" &&
          !topicError
      );

  const canSubmit = allMembersValid && isTopicValid && !submitting;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    if (!canSubmit) return;

    const normalizedRolls = members.map((m) => m.value.trim().toUpperCase());
    if (new Set(normalizedRolls).size !== normalizedRolls.length) {
      setSubmitError("Duplicate roll numbers are not allowed in the same team.");
      return;
    }

    const topicValue = !collectTopic
      ? undefined
      : hasTopicOptions
      ? selectedTopic || ""
      : freeTopic.trim().replace(/\s+/g, " ");

    setSubmitting(true);
    try {
      const res = await submitTeamForForm(slug, normalizedRolls, topicValue);
      setResult(res);
      setMembers(createEmptyMembers(minTeamSize));
      setSelectedTopic(null);
      setFreeTopic("");
      setFreeTopicStatus("idle");
      setTopicError(undefined);
      onSubmitted?.();
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setSubmitError(err.message);
        if (err.code === "ALREADY_REGISTERED" && err.rollNo) {
          const target = membersRef.current.find(
            (m) => m.value.trim().toUpperCase() === err.rollNo?.toUpperCase()
          );
          if (target) {
            updateMemberByUid(target.uid, {
              status: "warning",
              error: `Already registered in Team ${err.teamNo ?? ""}`.trim(),
            });
          }
        } else if (err.code === "TOPIC_TAKEN") {
          const msg = `Topic already chosen by Team ${err.teamNo ?? ""}`.trim();
          setTopicError(msg);
          if (!hasTopicOptions) {
            setFreeTopicStatus("warning");
          } else {
            loadTopics();
          }
        }
      } else {
        setSubmitError("Could not reach the server. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <SubmissionSuccess
        teamNumber={result.teamNo}
        members={result.members as StudentMember[]}
        topic={result.topic}
        formTitle={formTitle}
        onRegisterAnother={() => {
          setResult(null);
          setMembers(createEmptyMembers(minTeamSize));
          setSelectedTopic(null);
          setFreeTopic("");
          setFreeTopicStatus("idle");
          setTopicError(undefined);
          if (collectTopic && hasTopicOptions) {
            loadTopics();
          }
        }}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col space-y-3.5" noValidate>
      <AnimatePresence initial={false}>
        {members.map((member, index) => {
          const isRemovable = index >= minTeamSize;
          return (
            <motion.div
              key={member.uid}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={prefersReducedMotion ? {} : { opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-start gap-2"
            >
              <div className="flex-1">
                <GlassInput
                  name={`member-${index + 1}-roll-no`}
                  label={
                    index < minTeamSize
                      ? `Member ${index + 1} Roll No.`
                      : `Member ${index + 1} Roll No. (Optional)`
                  }
                  value={member.value}
                  status={member.status}
                  error={member.error}
                  studentName={member.name}
                  gender={member.gender}
                  maxLength={15}
                  onChange={(e) => handleRollChange(member.uid, e.target.value)}
                  onBlur={() => handleRollBlur(member.uid)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {isRemovable && (
                <motion.button
                  type="button"
                  initial={prefersReducedMotion ? false : { scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
                  onClick={() => handleRemoveMember(member.uid)}
                  aria-label={`Remove Member ${index + 1}`}
                  className="mt-1 flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/10 text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-4 w-4" />
                </motion.button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Add Member button when minTeamSize < maxTeamSize and not yet at max */}
      {members.length < maxTeamSize && (
        <motion.button
          type="button"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={prefersReducedMotion ? {} : { scale: 1.01 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.99 }}
          onClick={handleAddMember}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[#B15CFF]/40 bg-[#5227FF]/10 px-4 py-3 text-xs font-semibold text-[#FF9FFC] transition hover:border-[#FF9FFC]/60 hover:bg-[#5227FF]/20"
        >
          <Plus className="h-4 w-4" />
          Add Member ({members.length} of {maxTeamSize})
        </motion.button>
      )}

      {/* Optional Topic Section */}
      {collectTopic && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pt-1"
        >
          {hasTopicOptions ? (
            <GlassSelect
              label={
                allowTopicRepeat
                  ? "Project / Seminar Topic"
                  : "Project / Seminar Topic (Unique per team)"
              }
              options={topicOptions}
              value={selectedTopic}
              onChange={(topicName) => {
                setSelectedTopic(topicName);
                setTopicError(undefined);
                setSubmitError(null);
              }}
              loading={loadingTopics}
              error={topicError}
              placeholder="Choose a topic from the list"
            />
          ) : (
            <GlassInput
              name="team-topic"
              label={
                allowTopicRepeat
                  ? "Project / Seminar Topic"
                  : "Project / Seminar Topic (Unique per team)"
              }
              value={freeTopic}
              status={freeTopicStatus}
              error={topicError}
              helperText={
                freeTopicStatus === "valid" && !topicError
                  ? allowTopicRepeat
                    ? "Topic ready"
                    : "Topic is available"
                  : undefined
              }
              maxLength={180}
              onChange={(e) => handleFreeTopicChange(e.target.value)}
              onBlur={handleFreeTopicBlur}
              autoComplete="off"
            />
          )}
        </motion.div>
      )}

      {submitError && (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          {submitError}
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={!canSubmit}
        whileHover={canSubmit && !prefersReducedMotion ? { scale: 1.012 } : {}}
        whileTap={canSubmit && !prefersReducedMotion ? { scale: 0.985 } : {}}
        className="group relative mt-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-8 py-3.5 font-semibold text-white shadow-[0_8px_32px_-8px_rgba(82,39,255,0.65)] transition-all duration-300 hover:shadow-[0_8px_40px_-6px_rgba(255,159,252,0.7)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:shadow-[0_8px_32px_-8px_rgba(82,39,255,0.65)]"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <span className="relative flex items-center justify-center gap-2">
          {submitting && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
            </svg>
          )}
          {submitting
            ? "Registering Team…"
            : `Submit Team (${members.length} ${members.length === 1 ? "Member" : "Members"})`}
        </span>
      </motion.button>
    </form>
  );
}

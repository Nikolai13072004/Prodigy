"use client";

import { Check, Clock3, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Select } from "@/components/ui";

type AssignmentUser = {
  id: string;
  name: string;
  login: string;
  status: string;
  department: string;
  groups: string[];
};

type AssignmentGroup = {
  id: string;
  name: string;
};

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  users: AssignmentUser[];
  groups: AssignmentGroup[];
  pendingInviteEmails: string[];
  initialSelectedUserIds: string[];
  initialSelectedGroupIds: string[];
  initiallyAssignedUserIds: string[];
  initiallyAssignedGroupIds: string[];
  currentAccessLabel: string;
};

type RecipientTab = "groups" | "users" | "email";

type AssignmentMode = "ADD" | "REPLACE" | "CLEAR";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function toggleInSet(source: Set<string>, id: string) {
  const next = new Set(source);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function initials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function toDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function listSummary(count: number, one: string, few: string, many: string) {
  return `${count} ${pluralRu(count, one, few, many)}`;
}

function userStatusLabel(checked: boolean, assigned: boolean, mode: AssignmentMode) {
  if (mode === "CLEAR" && assigned) return "Будет снят";
  if (mode === "REPLACE") {
    if (checked && assigned) return "Останется";
    if (checked) return "Будет назначен";
    if (assigned) return "Будет снят";
  }
  if (checked && assigned) return "Уже назначен";
  if (checked) return "Будет назначен";
  if (assigned) return "Назначен";
  return "";
}

function groupStatusLabel(checked: boolean, assigned: boolean, mode: AssignmentMode) {
  if (mode === "CLEAR" && assigned) return "Будет снята";
  if (mode === "REPLACE") {
    if (checked && assigned) return "Останется";
    if (checked) return "Будет назначена";
    if (assigned) return "Будет снята";
  }
  if (checked && assigned) return "Уже назначена";
  if (checked) return "Будет назначена";
  if (assigned) return "Назначена";
  return "";
}

function statusClasses(checked: boolean, assigned: boolean, mode: AssignmentMode) {
  if (mode === "CLEAR" && assigned) return "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]";
  if (mode === "REPLACE" && assigned && !checked) return "border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning)]";
  if (checked && !assigned) return "border-[var(--info)] bg-[var(--info-soft)] text-[var(--info)]";
  if (checked && assigned) return "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]";
  if (assigned) return "border-[var(--line)] bg-[var(--success-soft)] text-[var(--success)]";
  return "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-muted)]";
}

export function AssignmentsManager({
  action,
  users,
  groups,
  pendingInviteEmails,
  initialSelectedUserIds,
  initialSelectedGroupIds,
  initiallyAssignedUserIds,
  initiallyAssignedGroupIds,
  currentAccessLabel,
}: Props) {
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>("ADD");
  const [recipientModalOpen, setRecipientModalOpen] = useState(false);
  const [activeRecipientTab, setActiveRecipientTab] = useState<RecipientTab>("groups");
  const [userQuery, setUserQuery] = useState("");
  const [groupQuery, setGroupQuery] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [onlyActiveUsers, setOnlyActiveUsers] = useState(false);
  const [onlyUnassignedUsers, setOnlyUnassignedUsers] = useState(false);
  const [onlyUnassignedGroups, setOnlyUnassignedGroups] = useState(false);
  const [showSelectedUsers, setShowSelectedUsers] = useState(false);
  const [showAssignedUsers, setShowAssignedUsers] = useState(false);
  const [showSelectedGroups, setShowSelectedGroups] = useState(false);
  const [showAssignedGroups, setShowAssignedGroups] = useState(false);
  const [accessDurationDays, setAccessDurationDays] = useState("");
  const [accessExpiresOn, setAccessExpiresOn] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set(initialSelectedUserIds));
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set(initialSelectedGroupIds));

  const initiallyAssignedUsers = useMemo(() => new Set(initiallyAssignedUserIds), [initiallyAssignedUserIds]);
  const initiallyAssignedGroups = useMemo(() => new Set(initiallyAssignedGroupIds), [initiallyAssignedGroupIds]);
  const minAccessDate = useMemo(() => toDateInputValue(new Date()), []);
  const disabled = assignmentMode === "CLEAR";

  useEffect(() => {
    if (!recipientModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRecipientModalOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [recipientModalOpen]);

  const assignedUsers = useMemo(
    () => users.filter((user) => initiallyAssignedUsers.has(user.id)),
    [initiallyAssignedUsers, users]
  );
  const assignedGroups = useMemo(
    () => groups.filter((group) => initiallyAssignedGroups.has(group.id)),
    [groups, initiallyAssignedGroups]
  );

  const shouldShowUsers = normalize(userQuery).length >= 2 || showSelectedUsers || showAssignedUsers;

  const filteredUsers = useMemo(() => {
    const q = normalize(userQuery);
    return users.filter((user) => {
      if (!shouldShowUsers) return false;
      if (onlyActiveUsers && user.status !== "ACTIVE") return false;
      if (onlyUnassignedUsers && initiallyAssignedUsers.has(user.id)) return false;
      if (showSelectedUsers && !selectedUsers.has(user.id)) return false;
      if (showAssignedUsers && !initiallyAssignedUsers.has(user.id)) return false;
      if (!q) return true;
      const inName = normalize(user.name).includes(q);
      const inLogin = normalize(user.login).includes(q);
      const inDepartment = normalize(user.department).includes(q);
      const inGroups = user.groups.some((groupName) => normalize(groupName).includes(q));
      return inName || inLogin || inDepartment || inGroups;
    });
  }, [
    initiallyAssignedUsers,
    onlyActiveUsers,
    onlyUnassignedUsers,
    selectedUsers,
    shouldShowUsers,
    showAssignedUsers,
    showSelectedUsers,
    userQuery,
    users,
  ]);

  const filteredGroups = useMemo(() => {
    const q = normalize(groupQuery);
    return groups.filter((group) => {
      if (onlyUnassignedGroups && initiallyAssignedGroups.has(group.id)) return false;
      if (showSelectedGroups && !selectedGroups.has(group.id)) return false;
      if (showAssignedGroups && !initiallyAssignedGroups.has(group.id)) return false;
      if (!q) return true;
      return normalize(group.name).includes(q);
    });
  }, [groupQuery, groups, initiallyAssignedGroups, onlyUnassignedGroups, selectedGroups, showAssignedGroups, showSelectedGroups]);

  const handleAssignmentModeChange = (value: string) => {
    const nextMode: AssignmentMode = value === "REPLACE" || value === "CLEAR" ? value : "ADD";
    setAssignmentMode(nextMode);

    if (nextMode === "REPLACE") {
      setSelectedUsers(new Set(initiallyAssignedUserIds));
      setSelectedGroups(new Set(initiallyAssignedGroupIds));
    } else if (nextMode === "ADD") {
      setSelectedUsers(new Set(initialSelectedUserIds));
      setSelectedGroups(new Set(initialSelectedGroupIds));
    }
  };

  const selectAllFilteredUsers = () => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((user) => next.add(user.id));
      return next;
    });
  };

  const clearFilteredUsers = () => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((user) => next.delete(user.id));
      return next;
    });
  };

  const selectAllFilteredGroups = () => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      filteredGroups.forEach((group) => next.add(group.id));
      return next;
    });
  };

  const clearFilteredGroups = () => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      filteredGroups.forEach((group) => next.delete(group.id));
      return next;
    });
  };

  const clearSelections = () => {
    setSelectedUsers(new Set());
    setSelectedGroups(new Set());
    setInviteEmails("");
  };

  const accessLabel = accessExpiresOn
    ? accessExpiresOn.split("-").reverse().join(".")
    : accessDurationDays
      ? `${accessDurationDays} дней`
      : "Без срока";

  const addedUserCount = Array.from(selectedUsers).filter((id) => !initiallyAssignedUsers.has(id)).length;
  const addedGroupCount = Array.from(selectedGroups).filter((id) => !initiallyAssignedGroups.has(id)).length;
  const removedUserCount = initiallyAssignedUserIds.filter((id) => !selectedUsers.has(id)).length;
  const removedGroupCount = initiallyAssignedGroupIds.filter((id) => !selectedGroups.has(id)).length;
  const inviteCount = inviteEmails
    .split(/[\s,;]+/)
    .map((email) => email.trim())
    .filter(Boolean).length;

  const submitLabel =
    assignmentMode === "CLEAR"
      ? "Снять все назначения"
      : assignmentMode === "REPLACE"
        ? "Применить список"
        : "Назначить выбранных";

  return (
    <form action={action} className="space-y-4">
      <section className="overflow-visible rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-sm">
        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(260px,0.85fr)_minmax(360px,1.15fr)] lg:items-stretch">
          <div className="rounded-2xl bg-[var(--surface)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Назначения курса</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">Кому доступен курс</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 font-medium text-[var(--ink)]">
                {listSummary(initiallyAssignedUsers.size, "сотрудник", "сотрудника", "сотрудников")}
              </span>
              <span className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 font-medium text-[var(--ink)]">
                {listSummary(initiallyAssignedGroups.size, "группа", "группы", "групп")}
              </span>
              {pendingInviteEmails.length > 0 ? (
                <span className="rounded-full border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-1 font-medium text-[var(--warning)]">
                  {listSummary(pendingInviteEmails.length, "приглашение", "приглашения", "приглашений")} ждут
                </span>
              ) : null}
              <span className="rounded-full border border-[var(--info)] bg-[var(--info-soft)] px-3 py-1 font-medium text-[var(--info)]">
                Срок: {currentAccessLabel}
              </span>
            </div>
          </div>

          <div className="flex rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-3">
            <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">Получатели</div>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Выбрано: {selectedGroups.size} групп · {selectedUsers.size} сотрудников · {inviteCount} email
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRecipientModalOpen(true);
                  setActiveRecipientTab("groups");
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Выбрать получателей
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--ink)]">Текущие назначения</h3>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <CompactAssignmentList
            title="Назначенные группы"
            empty="Группы еще не назначены."
            items={assignedGroups.map((group) => group.name)}
            moreLabel={(count) => `Еще ${listSummary(count, "группа", "группы", "групп")}`}
          />
          <CompactAssignmentList
            title="Назначенные сотрудники"
            empty="Индивидуальных назначений пока нет."
            items={assignedUsers.map((user) => user.name)}
            moreLabel={(count) => `Еще ${listSummary(count, "сотрудник", "сотрудника", "сотрудников")}`}
          />
          <CompactAssignmentList
            title="Ожидают регистрации"
            empty="Нет ожидающих приглашений."
            items={pendingInviteEmails}
            moreLabel={(count) => `Еще ${listSummary(count, "email", "email", "email")}`}
          />
        </div>
      </section>

      {recipientModalOpen ? (
        <div className="admin-content-modal fixed z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45"
            aria-label="Закрыть выбор получателей"
            onClick={() => setRecipientModalOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignmentRecipientDialogTitle"
            className="relative z-10 flex h-[min(640px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--success)]">Назначения</p>
                <h3 id="assignmentRecipientDialogTitle" className="mt-1 text-xl font-semibold text-[var(--ink)]">
                  Выбрать получателей
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRecipientModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Закрыть
              </button>
            </div>

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)_300px]">
              <aside className="min-h-0 border-b border-[var(--line)] bg-[var(--surface)] p-4 lg:border-b-0 lg:border-r">
                <div className="space-y-2">
                  <RecipientTabButton
                    active={activeRecipientTab === "groups"}
                    title="Группы"
                    onClick={() => setActiveRecipientTab("groups")}
                  />
                  <RecipientTabButton
                    active={activeRecipientTab === "users"}
                    title="Сотрудники"
                    onClick={() => setActiveRecipientTab("users")}
                  />
                  <RecipientTabButton
                    active={activeRecipientTab === "email"}
                    title="Новые по email"
                    onClick={() => setActiveRecipientTab("email")}
                  />
                </div>
              </aside>

              <div className="min-h-0 overflow-y-auto p-5">
                {activeRecipientTab === "groups" ? (
                  <div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="text-base font-semibold text-[var(--ink)]">Группы</h4>
                        <p className="mt-1 text-sm text-[var(--ink-muted)]">
                          {filteredGroups.length} найдено · {selectedGroups.size} выбрано
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={selectAllFilteredGroups}
                          disabled={disabled || filteredGroups.length === 0}
                          className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:cursor-default disabled:opacity-60"
                        >
                          Выбрать найденные
                        </button>
                        <button
                          type="button"
                          onClick={clearFilteredGroups}
                          disabled={disabled || filteredGroups.length === 0}
                          className="rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:cursor-default disabled:opacity-60"
                        >
                          Снять найденные
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                      <label className="sr-only" htmlFor="assignment-group-search">
                        Поиск группы
                      </label>
                      <input
                        id="assignment-group-search"
                        value={groupQuery}
                        onChange={(event) => setGroupQuery(event.target.value)}
                        placeholder="Поиск группы"
                        className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                      />
                      <FilterToggle checked={showSelectedGroups} onChange={setShowSelectedGroups} label="Выбранные" />
                      <FilterToggle checked={showAssignedGroups} onChange={setShowAssignedGroups} label="Назначенные" />
                      <FilterToggle checked={onlyUnassignedGroups} onChange={setOnlyUnassignedGroups} label="Новые" />
                    </div>

                    <div className="mt-4 space-y-2">
                      {filteredGroups.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-8 text-sm text-[var(--ink-muted)]">
                          Группы не найдены.
                        </p>
                      ) : (
                        filteredGroups.map((group) => {
                          const checked = selectedGroups.has(group.id);
                          const assigned = initiallyAssignedGroups.has(group.id);
                          const label = groupStatusLabel(checked, assigned, assignmentMode);

                          return (
                            <div
                              key={group.id}
                              className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                                checked
                                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                                  : "border-[var(--line)] bg-[var(--surface-raised)] hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
                              } ${disabled ? "opacity-70" : ""}`}
                            >
                              <input
                                type="checkbox"
                                aria-label={group.name}
                                checked={checked}
                                onChange={() => setSelectedGroups((prev) => toggleInSet(prev, group.id))}
                                disabled={disabled}
                              />
                              <span className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{group.name}</span>
                              {label ? (
                                <span
                                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                                    checked,
                                    assigned,
                                    assignmentMode
                                  )}`}
                                >
                                  {label}
                                </span>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : null}

                {activeRecipientTab === "users" ? (
                  <div>
                    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-base font-semibold text-[var(--ink)]">Сотрудники</h4>
                        <span className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
                          {shouldShowUsers ? `${filteredUsers.length} найдено` : "Поиск от 2 символов"} · {selectedUsers.size} выбрано
                        </span>
                      </div>

                      <div className="mt-3">
                        <label className="sr-only" htmlFor="assignment-user-search">
                          Поиск пользователей
                        </label>
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
                            aria-hidden="true"
                          />
                          <input
                            id="assignment-user-search"
                            value={userQuery}
                            onChange={(event) => setUserQuery(event.target.value)}
                            placeholder="Найти по имени, логину, отделу или группе"
                            className="h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] pl-10 pr-3 text-sm outline-none ring-[var(--accent)] focus:ring-2"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <CompactFilterToggle checked={showSelectedUsers} onChange={setShowSelectedUsers} label="Выбранные" />
                        <CompactFilterToggle checked={showAssignedUsers} onChange={setShowAssignedUsers} label="Назначенные" />
                        <CompactFilterToggle checked={onlyActiveUsers} onChange={setOnlyActiveUsers} label="Активные" />
                        <CompactFilterToggle checked={onlyUnassignedUsers} onChange={setOnlyUnassignedUsers} label="Новые" />
                      </div>
                    </div>

                    {shouldShowUsers ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-muted)]">
                        <span>
                          {filteredUsers.length === 0
                            ? "Нет подходящих сотрудников"
                            : `Показано ${listSummary(filteredUsers.length, "сотрудник", "сотрудника", "сотрудников")}`}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={selectAllFilteredUsers}
                            disabled={disabled || filteredUsers.length === 0}
                            className="font-medium text-[var(--accent)] hover:text-[var(--accent-strong)] disabled:cursor-default disabled:text-[var(--ink-muted)]"
                          >
                            Выбрать показанных
                          </button>
                          <span className="text-[var(--ink-muted)]">·</span>
                          <button
                            type="button"
                            onClick={clearFilteredUsers}
                            disabled={disabled || filteredUsers.length === 0}
                            className="font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] disabled:cursor-default disabled:text-[var(--ink-muted)]"
                          >
                            Снять показанных
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)]">
                      {!shouldShowUsers ? (
                        <div className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">
                          Введите часть имени или включите фильтр выше.
                        </div>
                      ) : filteredUsers.length === 0 ? (
                        <div className="px-5 py-8 text-center text-sm text-[var(--ink-muted)]">Ничего не найдено.</div>
                      ) : (
                        <div className="max-h-[52vh] divide-y divide-[var(--line)] overflow-y-auto">
                          {filteredUsers.map((user) => {
                            const checked = selectedUsers.has(user.id);
                            const assigned = initiallyAssignedUsers.has(user.id);
                            const label = userStatusLabel(checked, assigned, assignmentMode);

                            return (
                              <div
                                key={user.id}
                                title={`${user.login} · ${user.department} · ${
                                  user.groups.length > 0 ? user.groups.join(", ") : "Без групп"
                                }`}
                                className={`flex items-center gap-3 px-4 py-3 transition ${
                                  checked ? "bg-[var(--accent-soft)]" : "bg-[var(--surface-raised)] hover:bg-[var(--accent-soft)]"
                                } ${disabled ? "opacity-70" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  aria-label={user.name}
                                  checked={checked}
                                  onChange={() => setSelectedUsers((prev) => toggleInSet(prev, user.id))}
                                  disabled={disabled}
                                />
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[11px] font-semibold text-white">
                                  {initials(user.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium text-[var(--ink)]">{user.name}</span>
                                  <span className="block truncate text-xs text-[var(--ink-muted)]">
                                    {user.department !== "Без подразделения" ? user.department : user.login}
                                  </span>
                                </span>
                                {label ? (
                                  <span
                                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(
                                      checked,
                                      assigned,
                                      assignmentMode
                                    )}`}
                                  >
                                    {label}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {activeRecipientTab === "email" ? (
                  <div>
                    <h4 className="text-base font-semibold text-[var(--ink)]">Новые ученики по email</h4>

                    <label htmlFor="assignment-invite-emails" className="mt-4 block text-sm font-medium text-[var(--ink)]">
                      Email учеников
                    </label>
                    <textarea
                      id="assignment-invite-emails"
                      value={inviteEmails}
                      onChange={(event) => setInviteEmails(event.target.value)}
                      disabled={disabled}
                      rows={8}
                      placeholder={"test1@example.com\ntest2@example.com, test3@example.com"}
                      className="mt-1.5 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-3 text-sm outline-none ring-[var(--accent)] focus:ring-2 disabled:cursor-default disabled:bg-[var(--surface)]"
                    />

                    {pendingInviteEmails.length > 0 ? (
                      <div className="mt-4 rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-3">
                        <p className="text-xs font-medium text-[var(--warning)]">Уже ожидают регистрации</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {pendingInviteEmails.map((email) => (
                            <span
                              key={email}
                              className="inline-flex rounded-full border border-[var(--warning)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--warning)]"
                            >
                              {email}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <aside className="min-h-0 overflow-y-auto border-t border-[var(--line)] bg-[var(--surface)] p-5 lg:border-l lg:border-t-0">
                <h4 className="text-sm font-semibold text-[var(--ink)]">Выбрано</h4>
                <div className="mt-3 grid gap-2 text-sm text-[var(--ink)]">
                  <SummaryLine label="Группы" value={selectedGroups.size} />
                  <SummaryLine label="Сотрудники" value={selectedUsers.size} />
                  <SummaryLine label="Email" value={inviteCount} />
                </div>

                <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] p-3 text-xs text-[var(--ink-muted)]">
                  {assignmentMode === "CLEAR" ? (
                    <p>Будут сняты все текущие назначения курса.</p>
                  ) : assignmentMode === "REPLACE" ? (
                    <p>
                      Останется выбранный список. Будет снято: {removedUserCount} сотрудников · {removedGroupCount} групп.
                    </p>
                  ) : (
                    <p>
                      Будет добавлено: {addedUserCount} сотрудников · {addedGroupCount} групп · {inviteCount} email.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={clearSelections}
                  disabled={disabled || (selectedUsers.size === 0 && selectedGroups.size === 0 && inviteEmails.trim() === "")}
                  className="mt-5 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 py-2 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] disabled:cursor-default disabled:opacity-60"
                >
                  Очистить выбор
                </button>
              </aside>
            </div>

            <div className="grid gap-3 border-t border-[var(--line)] bg-[var(--surface-raised)] px-6 py-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
                <Select
                  name="assignmentMode"
                  value={assignmentMode}
                  onChange={(event) => handleAssignmentModeChange(event.target.value)}
                >
                  <option value="ADD">Дополнить текущие</option>
                  <option value="REPLACE">Заменить весь список</option>
                  <option value="CLEAR">Снять все назначения</option>
                </Select>

                <details className="relative">
                  <summary className="inline-flex h-10 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-4 text-sm font-medium text-[var(--ink)] hover:bg-[var(--accent-soft)] [&::-webkit-details-marker]:hidden md:w-auto">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                    {accessLabel}
                  </summary>
                  <div className="absolute bottom-12 right-0 z-20 grid w-72 gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 shadow-xl">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[var(--ink-muted)]">Быстрый срок</span>
                      <Select
                        name="accessDurationDays"
                        value={accessDurationDays}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAccessDurationDays(value);
                          if (value) setAccessExpiresOn("");
                        }}
                        disabled={disabled}
                      >
                        <option value="">Без срока</option>
                        <option value="30">30 дней</option>
                        <option value="60">60 дней</option>
                        <option value="90">90 дней</option>
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-[var(--ink-muted)]">Точная дата</span>
                      <input
                        type="date"
                        name="accessExpiresOn"
                        value={accessExpiresOn}
                        min={minAccessDate}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAccessExpiresOn(value);
                          if (value) setAccessDurationDays("");
                        }}
                        disabled={disabled}
                        className="h-10 rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--ink)] outline-none ring-[var(--accent)] focus:ring-2"
                      />
                    </label>
                  </div>
                </details>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="submit"
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white ${
                    assignmentMode === "CLEAR" ? "bg-[var(--danger)] hover:opacity-90" : "bg-[var(--accent)] hover:bg-[var(--accent-strong)]"
                  }`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {submitLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input type="hidden" name="inviteEmails" value={inviteEmails} />

      {Array.from(selectedUsers).map((userId) => (
        <input key={userId} type="hidden" name="userId" value={userId} />
      ))}
      {Array.from(selectedGroups).map((groupId) => (
        <input key={groupId} type="hidden" name="groupId" value={groupId} />
      ))}
    </form>
  );
}

function CompactAssignmentList({
  title,
  empty,
  items,
  moreLabel,
}: {
  title: string;
  empty: string;
  items: string[];
  moreLabel: (count: number) => string;
}) {
  const visibleItems = items.slice(0, 6);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <h4 className="text-sm font-semibold text-[var(--ink)]">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ink-muted)]">{empty}</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleItems.map((item) => (
            <span key={item} className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--ink)]">
              {item}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="rounded-full border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-1 text-xs font-medium text-[var(--ink-muted)]">
              {moreLabel(hiddenCount)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function RecipientTabButton({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
        active ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]" : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      {description ? <span className="mt-1 block text-xs leading-relaxed text-[var(--ink-muted)]">{description}</span> : null}
    </button>
  );
}

function FilterToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-xs text-[var(--ink-muted)]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function CompactFilterToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition ${
        checked
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-muted)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2">
      <span>{label}</span>
      <span className="font-semibold text-[var(--ink)]">{value}</span>
    </div>
  );
}

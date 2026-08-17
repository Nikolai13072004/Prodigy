"use client";

import { useActionState, useMemo, useState } from "react";
import {
  INITIAL_ROLE_PERMISSIONS_FORM_STATE,
  type RolePermissionsFormState,
  type RolePermissionsFormValues,
} from "@/app/admin/roles/role-permissions-form-state";
import {
  ACCESS_GROUP_LABELS,
  GROUP_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  type Permission,
} from "@/lib/roles";

type Props = {
  action: (state: RolePermissionsFormState, formData: FormData) => Promise<RolePermissionsFormState>;
  submitLabel: string;
  defaultName?: string;
  selectedPermissions?: Permission[];
  disableName?: boolean;
};

type FormBodyProps = {
  disableName: boolean;
  formAction: (payload: FormData) => void;
  initialValues: RolePermissionsFormValues;
  pending: boolean;
  state: RolePermissionsFormState;
  submitLabel: string;
};

function RolePermissionsFormBody({
  disableName,
  formAction,
  initialValues,
  pending,
  state,
  submitLabel,
}: FormBodyProps) {
  const [isDirty, setIsDirty] = useState(false);
  const formId = "role-permissions-form";
  const selectedSet = useMemo(() => new Set(initialValues.permissions), [initialValues.permissions]);
  const groupOrder = Object.keys(ACCESS_GROUP_LABELS) as Array<keyof typeof ACCESS_GROUP_LABELS>;
  const permissionLabelByKey = useMemo(
    () => new Map(PERMISSION_DEFINITIONS.map((definition) => [definition.key, definition.label])),
    []
  );

  return (
    <form id={formId} action={formAction} onChange={() => setIsDirty(true)} className="space-y-6">
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {state.error}
        </p>
      ) : null}

      {!state.error && pending ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          Сохраняем изменения роли...
        </p>
      ) : null}

      {!state.error && !pending && isDirty ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Есть несохраненные изменения.
        </p>
      ) : null}

      {!state.error && !pending && !isDirty && state.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          {state.success}
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-200" htmlFor="role-name">
          Название роли
        </label>
        <input
          id="role-name"
          name="name"
          required
          defaultValue={initialValues.name}
          readOnly={disableName}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          placeholder="Например: Методист"
        />
        {disableName ? (
          <p className="mt-2 text-xs text-zinc-500">Системные роли нельзя переименовывать.</p>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <h2 className="text-lg font-semibold">Разрешения доступа</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {groupOrder.map((group) => (
            <section
              key={group}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {ACCESS_GROUP_LABELS[group]}
              </h3>
              <div className="space-y-2">
                {GROUP_PERMISSIONS[group].map((permission) => (
                  <label
                    key={permission}
                    className="flex items-start gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <input
                      type="checkbox"
                      name="permission"
                      value={permission}
                      defaultChecked={selectedSet.has(permission)}
                    />
                    <span>{permissionLabelByKey.get(permission) ?? permission}</span>
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          form={formId}
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {pending ? "Сохраняем..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function RolePermissionsForm({
  action,
  submitLabel,
  defaultName = "",
  selectedPermissions = [],
  disableName = false,
}: Props) {
  const [state, formAction, pending] = useActionState(action, INITIAL_ROLE_PERMISSIONS_FORM_STATE);
  const initialValues = state.values ?? { name: defaultName, permissions: selectedPermissions };

  return (
    <RolePermissionsFormBody
      key={JSON.stringify(initialValues)}
      disableName={disableName}
      formAction={formAction}
      initialValues={initialValues}
      pending={pending}
      state={state}
      submitLabel={submitLabel}
    />
  );
}

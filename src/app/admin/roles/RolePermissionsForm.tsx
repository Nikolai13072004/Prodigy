"use client";

import { useActionState, useMemo, useState } from "react";
import {
  INITIAL_ROLE_PERMISSIONS_FORM_STATE,
  type RolePermissionsFormState,
  type RolePermissionsFormValues,
} from "@/app/admin/roles/role-permissions-form-state";
import { Button, Card, Field, Input } from "@/components/ui";
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
          className="rounded-[var(--radius-panel)] border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]"
        >
          {state.error}
        </p>
      ) : null}

      {!state.error && pending ? (
        <p className="rounded-[var(--radius-panel)] border border-[var(--info)] bg-[var(--info-soft)] px-4 py-3 text-sm text-[var(--info)]">
          Сохраняем изменения роли...
        </p>
      ) : null}

      {!state.error && !pending && isDirty ? (
        <p className="rounded-[var(--radius-panel)] border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm text-[var(--warning)]">
          Есть несохраненные изменения.
        </p>
      ) : null}

      {!state.error && !pending && !isDirty && state.success ? (
        <p className="rounded-[var(--radius-panel)] border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success)]">
          {state.success}
        </p>
      ) : null}

      <Card>
        <Field
          label="Название роли"
          htmlFor="role-name"
          hint={disableName ? "Системные роли нельзя переименовывать." : undefined}
        >
          <Input
            id="role-name"
            name="name"
            required
            defaultValue={initialValues.name}
            readOnly={disableName}
            placeholder="Например: Методист"
          />
        </Field>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Разрешения доступа</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {groupOrder.map((group) => (
            <section
              key={group}
              className="rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface)] p-4"
            >
              <h3 className="mb-3 text-sm font-semibold text-[var(--ink)]">
                {ACCESS_GROUP_LABELS[group]}
              </h3>
              <div className="space-y-2">
                {GROUP_PERMISSIONS[group].map((permission) => (
                  <label
                    key={permission}
                    className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
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
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" form={formId} disabled={pending}>
          {pending ? "Сохраняем..." : submitLabel}
        </Button>
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

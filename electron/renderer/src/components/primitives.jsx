import { createContext, useContext, useId, useState } from "react";
import { ChevronDown, HelpCircle } from "@untitledui/icons";
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  Disclosure as AriaDisclosure,
  DisclosurePanel as AriaDisclosurePanel,
  Radio as AriaRadio,
  RadioGroup as AriaRadioGroup,
} from "react-aria-components";
import { Button as BaseButton } from "@/components/base/buttons/button";
import { Checkbox as BaseCheckbox, CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Input as BaseInput } from "@/components/base/input/input";
import { RadioButtonBase } from "@/components/base/radio-buttons/radio-buttons";
import { Select as BaseSelect } from "@/components/base/select/select";
import { Toggle as BaseToggle } from "@/components/base/toggle/toggle";
import { cx } from "@/utils/cx";

/** True while a job is running. Every control except Cancel is disabled while busy. */
export const BusyContext = createContext(false);

export function useBusy() {
  return useContext(BusyContext);
}

const toneClasses = {
  neutral: "text-tertiary",
  success: "text-success-primary",
  error: "text-error-primary",
  working: "text-brand-secondary",
};

export function Hint({ id, tone = "neutral", className, children, ...props }) {
  if (!children) return null;
  return (
    <p id={id} className={cx("text-sm", toneClasses[tone] || toneClasses.neutral, className)} {...props}>
      {children}
    </p>
  );
}

/** Live preview line shown under a field. Becomes an error line when validation fails. */
export function Preview({ id, error, children }) {
  return (
    <p
      id={id}
      data-live-preview
      className={cx(
        "rounded-md px-2.5 py-1.5 text-sm font-medium break-all",
        error ? "bg-error-primary text-error-primary" : "bg-secondary text-secondary"
      )}
    >
      {error || children}
    </p>
  );
}

export function Button({ isDisabled, allowWhileBusy = false, ...props }) {
  const busy = useBusy();
  return <BaseButton {...props} isDisabled={isDisabled || (busy && !allowWhileBusy)} />;
}

export function TextInput({ error, hint, hintTone, isDisabled, describedBy, className, ...props }) {
  const busy = useBusy();
  const hintNode = error
    ? error
    : hint && hintTone && hintTone !== "neutral"
      ? <span className={toneClasses[hintTone]}>{hint}</span>
      : hint;
  return (
    <BaseInput
      size="md"
      {...props}
      aria-describedby={describedBy}
      className={className}
      isInvalid={Boolean(error)}
      isDisabled={isDisabled || busy}
      hint={hintNode}
    />
  );
}

export function Checkbox({ isDisabled, ...props }) {
  const busy = useBusy();
  return <BaseCheckbox size="md" {...props} isDisabled={isDisabled || busy} />;
}

export function Toggle({ isDisabled, ...props }) {
  const busy = useBusy();
  return <BaseToggle size="md" {...props} isDisabled={isDisabled || busy} />;
}

export function Select({ isDisabled, error, hint, ...props }) {
  const busy = useBusy();
  return (
    <BaseSelect size="md" {...props} isInvalid={Boolean(error)} hint={error || hint} isDisabled={isDisabled || busy} />
  );
}

/** Card used for each main area of a workflow. */
export function Section({ id, title, subtitle, titleId, subtitleId, actions, children, className, isDimmed }) {
  return (
    <section
      id={id}
      className={cx(
        "rounded-xl bg-primary shadow-xs ring-1 ring-secondary ring-inset",
        isDimmed && "opacity-60",
        className
      )}
    >
      <header className="flex flex-col gap-4 border-b border-secondary px-5 py-5 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-primary">{title}</h2>
          {subtitle && <p id={subtitleId} className="mt-0.5 text-sm text-tertiary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </header>
      <div className="flex flex-col gap-6 px-5 py-6 md:px-6">{children}</div>
    </section>
  );
}

export function FieldLabel({ children, className, ...props }) {
  return (
    <span className={cx("text-sm font-medium text-secondary", className)} {...props}>
      {children}
    </span>
  );
}

/** A labelled group of controls that is not a single text input. */
export function FieldGroup({ label, labelTitle, children, className }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      {label && <FieldLabel title={labelTitle}>{label}</FieldLabel>}
      {children}
    </div>
  );
}

/** Subtle framed area used to group related settings inside a section. */
export function Panel({ id, title, description, children, className }) {
  return (
    <div id={id} className={cx("flex flex-col gap-4 rounded-xl bg-secondary p-4 ring-1 ring-secondary ring-inset md:p-5", className)}>
      {(title || description) && (
        <div>
          {title && <p className="text-sm font-semibold text-primary">{title}</p>}
          {description && <p className="mt-0.5 text-sm text-tertiary">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

const cardBase =
  "relative flex h-full min-h-16 cursor-pointer items-start gap-3 rounded-xl bg-primary p-4 ring-1 ring-secondary ring-inset transition duration-100 ease-linear";
const cardSelected = "bg-brand-primary_alt ring-2 ring-brand";
const cardDisabled = "cursor-not-allowed opacity-60";

function CardCopy({ title, description, badge }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-secondary">
        {title}
        {badge}
      </span>
      {description && <span className="text-sm text-tertiary">{description}</span>}
    </span>
  );
}

/** Radio group shown as selectable cards. Options: { value, id, title, description }. */
export function ChoiceCards({ label, name, value, onChange, options, columns = 2, className, isDisabled }) {
  const busy = useBusy();
  return (
    <AriaRadioGroup
      aria-label={label}
      name={name}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled || busy}
      className={cx("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3", className)}
    >
      {options.map((option) => (
        <AriaRadio
          key={option.value}
          id={option.id}
          value={option.value}
          data-choice-card
          className={(state) =>
            cx(cardBase, state.isSelected && cardSelected, state.isDisabled && cardDisabled, state.isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring")
          }
        >
          {({ isSelected, isDisabled: radioDisabled }) => (
            <>
              <RadioButtonBase size="md" isSelected={isSelected} isDisabled={radioDisabled} className="mt-0.5" />
              <CardCopy title={option.title} description={option.description} badge={option.badge} />
            </>
          )}
        </AriaRadio>
      ))}
    </AriaRadioGroup>
  );
}

/** Checkbox shown as a selectable card. */
export function CheckCard({ id, value, title, description, isSelected, onChange, isDisabled, className, inputClassName }) {
  const busy = useBusy();
  return (
    <AriaCheckbox
      id={id}
      value={value}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled || busy}
      data-choice-card
      inputRef={(element) => {
        if (element && inputClassName) element.classList.add(inputClassName);
      }}
      className={(state) =>
        cx(cardBase, state.isSelected && cardSelected, state.isDisabled && cardDisabled, state.isFocusVisible && "outline-2 outline-offset-2 outline-focus-ring", className)
      }
    >
      {({ isSelected: selected, isDisabled: checkboxDisabled }) => (
        <>
          <CheckboxBase size="md" isSelected={selected} isDisabled={checkboxDisabled} className="mt-0.5" />
          <CardCopy title={title} description={description} />
        </>
      )}
    </AriaCheckbox>
  );
}

/** Collapsible help content. Items: [title, copy]. */
export function HelpDisclosure({ id, summary, items, columns = 3 }) {
  const [isExpanded, setExpanded] = useState(false);
  const panelId = useId();
  return (
    <AriaDisclosure
      isExpanded={isExpanded}
      onExpandedChange={setExpanded}
      className="rounded-xl bg-secondary ring-1 ring-secondary ring-inset"
    >
      <div id={id} data-context-help data-open={isExpanded || undefined}>
      <AriaButton
        slot="trigger"
        aria-controls={panelId}
        className={({ isFocusVisible }) =>
          cx(
            "flex w-full cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-semibold text-secondary outline-focus-ring transition duration-100 ease-linear hover:text-secondary_hover",
            isFocusVisible && "outline-2 outline-offset-2"
          )
        }
      >
        <HelpCircle aria-hidden="true" className="size-4 shrink-0 text-fg-quaternary" />
        <span className="flex-1">{summary}</span>
        <ChevronDown
          aria-hidden="true"
          className={cx("size-4 shrink-0 text-fg-quaternary transition duration-100 ease-linear", isExpanded && "rotate-180")}
        />
      </AriaButton>
      <AriaDisclosurePanel id={panelId}>
        <dl
          className={cx(
            "grid gap-x-6 gap-y-4 border-t border-secondary px-4 py-4",
            columns === 3 && "sm:grid-cols-2 xl:grid-cols-3",
            columns === 5 && "sm:grid-cols-2 xl:grid-cols-5"
          )}
        >
          {items.map(([title, copy]) => (
            <div key={title} data-help-item>
              <dt className="text-sm font-semibold text-primary">{title}</dt>
              <dd className="mt-0.5 text-sm text-tertiary">{copy}</dd>
            </div>
          ))}
        </dl>
      </AriaDisclosurePanel>
      </div>
    </AriaDisclosure>
  );
}

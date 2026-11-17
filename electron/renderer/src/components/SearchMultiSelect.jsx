import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, SearchLg } from "@untitledui/icons";
import { Button as AriaButton, ListBox as AriaListBox, ListBoxItem as AriaListBoxItem } from "react-aria-components";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { InputBase, TextField } from "@/components/base/input/input";
import { Tag, TagGroup, TagList } from "@/components/base/tags/tags";
import { cx } from "@/utils/cx";
import { Checkbox, FieldLabel, Hint, Preview, useBusy } from "./primitives";

/**
 * Searchable multi-select used for Stations, Payment Authority Codes, Networks and SEOC values.
 *
 * `index` is a list of { key, searchText, title, copy, details, isDisabled, tooltip } entries.
 * Only the first `limit` matches are rendered so large catalogs stay fast.
 */
export function SearchMultiSelect({
  id,
  inputId,
  menuId,
  selectedId,
  matchId,
  label,
  labelTitle,
  ariaLabel,
  listLabel,
  placeholder,
  index,
  limit = 60,
  selectedKeys,
  onChange,
  chipLabel,
  emptyText,
  summaryText,
  matchText,
  matchTone = "neutral",
  useAll,
  preview,
  error,
  onQueryChange,
}) {
  const busy = useBusy();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);

  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(
    () => (normalizedQuery ? index.filter((entry) => entry.searchText.includes(normalizedQuery)) : index),
    [index, normalizedQuery]
  );
  const visible = useMemo(() => matches.slice(0, limit), [matches, limit]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

  const updateQuery = (value) => {
    setQuery(value);
    onQueryChange?.(value);
  };

  const handleSelectionChange = (keys) => {
    const next = keys === "all" ? visible.map((entry) => entry.key) : [...keys].map(String);
    const kept = selectedKeys.filter((key) => next.includes(key));
    const added = next.filter((key) => !selectedKeys.includes(key));
    onChange([...kept, ...added]);
    updateQuery("");
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
    }, 120);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel title={labelTitle}>{label}</FieldLabel>
      <div id={id} ref={rootRef} data-combobox data-open={isOpen || undefined} className="relative" onBlur={handleBlur}>
        <TextField
          aria-label={ariaLabel || `Search ${listLabel}`}
          id={inputId}
          value={query}
          isDisabled={busy}
          isInvalid={Boolean(error)}
          autoComplete="off"
          onChange={(value) => {
            updateQuery(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              window.requestAnimationFrame(() => listRef.current?.querySelector('[role="option"]')?.focus());
            }
          }}
        >
          <InputBase
            ref={inputRef}
            size="md"
            icon={SearchLg}
            placeholder={placeholder}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={menuId}
            aria-expanded={isOpen}
            inputClassName="pr-10"
          />
          <AriaButton
            aria-label={`Show ${listLabel} options`}
            excludeFromTabOrder
            isDisabled={busy}
            onPress={() => {
              setOpen((open) => !open);
              inputRef.current?.focus();
            }}
            className="absolute top-0 right-0 flex h-full cursor-pointer items-center px-3 text-fg-quaternary outline-hidden transition duration-100 ease-linear hover:text-fg-quaternary_hover"
          >
            <ChevronDown aria-hidden="true" className={cx("size-4 stroke-[2.25px] transition duration-100 ease-linear", isOpen && "rotate-180")} />
          </AriaButton>
        </TextField>

        {isOpen && (
          <div
            id={menuId}
            data-combobox-menu
            className="absolute top-full right-0 left-0 z-30 mt-1 max-h-76 overflow-y-auto rounded-lg bg-primary py-1 shadow-lg ring-1 ring-secondary_alt"
          >
            <AriaListBox
              ref={listRef}
              aria-label={listLabel}
              selectionMode="multiple"
              selectedKeys={new Set(selectedKeys)}
              onSelectionChange={handleSelectionChange}
              items={visible}
              renderEmptyState={() => (
                <p data-combobox-empty className="px-3 py-4 text-center text-sm text-tertiary">{emptyText}</p>
              )}
              className="outline-hidden"
            >
              {(entry) => (
                <AriaListBoxItem
                  id={entry.key}
                  textValue={entry.title}
                  isDisabled={entry.isDisabled}
                  data-option-key={entry.key}
                  className="group block cursor-pointer px-1.5 py-px outline-hidden"
                >
                  {({ isSelected, isFocused, isFocusVisible, isDisabled }) => (
                    <div
                      title={entry.tooltip}
                      className={cx(
                        "flex items-start gap-2.5 rounded-md p-2 pr-2.5 outline-focus-ring select-none",
                        isSelected && "bg-active",
                        isDisabled ? "cursor-not-allowed opacity-50" : "group-hover:bg-primary_hover",
                        isFocused && "bg-primary_hover",
                        isFocusVisible && "outline-2 -outline-offset-2"
                      )}
                    >
                      <CheckboxBase size="sm" isSelected={isSelected} isDisabled={isDisabled} className="mt-1" />
                      <div className="flex min-w-0 flex-col">
                        <span data-option-title className="truncate text-md font-medium text-primary">{entry.title}</span>
                        {entry.copy && <span data-option-copy className="text-sm text-tertiary">{entry.copy}</span>}
                        {entry.details && (
                          <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-tertiary">
                            {entry.details.map(([detailLabel, value]) => (
                              <span key={detailLabel} data-option-field>
                                <strong className="font-semibold text-secondary">{detailLabel}:</strong> {value || "—"}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </AriaListBoxItem>
              )}
            </AriaListBox>
            {matches.length > limit && (
              <p data-combobox-summary className="border-t border-secondary px-3 py-2 text-xs text-tertiary">
                {summaryText ? summaryText(limit, matches.length, Boolean(normalizedQuery)) : `Showing ${limit} of ${matches.length.toLocaleString()} matches. Keep typing to narrow the list.`}
              </p>
            )}
          </div>
        )}
      </div>

      <Hint id={matchId} tone={matchTone}>{matchText}</Hint>

      {selectedKeys.length > 0 && (
        <div id={selectedId} aria-live="polite">
          <TagGroup label={`Selected ${listLabel}`} size="md">
            <TagList className="flex flex-wrap gap-1.5">
              {selectedKeys.map((key) => (
                <Tag
                  key={key}
                  id={key}
                  isDisabled={busy}
                  onClose={() => onChange(selectedKeys.filter((value) => value !== key))}
                >
                  {chipLabel(key)}
                </Tag>
              ))}
            </TagList>
          </TagGroup>
        </div>
      )}

      {useAll && (
        <Checkbox id={useAll.id} isSelected={useAll.isSelected} onChange={useAll.onChange} label={useAll.label} />
      )}
      {preview && <Preview id={preview.id} error={error}>{preview.text}</Preview>}
    </div>
  );
}

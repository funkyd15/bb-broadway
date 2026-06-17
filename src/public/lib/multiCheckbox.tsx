import React from 'react';
import { Box, Checkbox } from '@wix/design-system';

export interface MultiCheckboxItem {
  label: string;
  value: string;
}

interface MultiCheckboxProps {
  items: MultiCheckboxItem[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  showSelectAll?: boolean;
  selectAllLabel?: string;
  disabled?:boolean;
}

export const MultiCheckbox: React.FC<MultiCheckboxProps> = ({
  items,
  selectedValues,
  onChange,
  showSelectAll = true,
  selectAllLabel = 'Select All',
  disabled= false,
}) => {
  const isAllSelected =
    items.length > 0 &&
    items.every((item) => selectedValues.includes(item.value));

  const isAllDeselected = selectedValues.length === 0;

  const toggleItem = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange(items.map((item) => item.value));
    }
  };

  return (
    <Box direction="vertical" gap="12px">
      {showSelectAll && (
        <Checkbox
          checked={isAllSelected}
          onChange={toggleAll}
          disabled={disabled}
          >
          {selectAllLabel}
        </Checkbox>
      )}

      {items.map((item) => (
        <Checkbox
        key={item.value}
        checked={selectedValues.includes(item.value)}
        onChange={() => toggleItem(item.value)}
        disabled={disabled}
        >
          {item.label}
        </Checkbox>
      ))}
    </Box>
  );
};

export default MultiCheckbox;
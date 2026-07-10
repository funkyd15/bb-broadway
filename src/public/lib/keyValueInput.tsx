import React, { useState, useEffect } from 'react';
import { Box, Dropdown, Input, Button, IconButton } from '@wix/design-system';
import {
 Add,
 Delete,
} from "@wix/wix-ui-icons-common/odeditor";
export interface KeyValueSelectorItem {
  label: string;
  value: string;
}

export interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueInputProps {
  items: KeyValueSelectorItem[];
  value?: KeyValuePair[];
  onChange?: (pairs: KeyValuePair[]) => void;
  disabled?: boolean;
}


const KeyValueInput: React.FC<KeyValueInputProps> = ({
  items,
  value,
  onChange,
  disabled = false,
}) => {


  // Support both controlled and uncontrolled usage
  const [internalPairs, setInternalPairs] = useState<KeyValuePair[]>([
    { key: '', value: '' },
  ]);

  useEffect(() => {
    // console.log(internalPairs);

  }, [internalPairs])

  const pairs = value ?? internalPairs;

  const updatePairs = (newPairs: KeyValuePair[]) => {
    if (value === undefined) {
      setInternalPairs(newPairs);
    }

    onChange?.(newPairs);
  };

  const updatePair = (
    index: number,
    field: keyof KeyValuePair,
    fieldValue: string,
  ) => {
    const newPairs = [...pairs];
    newPairs[index] = {
      ...newPairs[index],
      [field]: fieldValue,
    };

    updatePairs(newPairs);
  };

  const addPair = () => {
    updatePairs([
      ...pairs,
      {
        key: '',
        value: '',
      },
    ]);
  };

  const removePair = (index: number) => {
    updatePairs(pairs.filter((_, i) => i !== index));
  };

  const dropdownOptions = items.map((item) => ({
    id: item.value,
    value: item.label,
  }));

  return (
    <Box direction="vertical" gap="12px">
      {pairs.map((pair, index) => (
        <Box key={index} gap="12px" align="left">
          <Dropdown
            placeholder="Select key"
            options={dropdownOptions}
            selectedId={pair.key || undefined}
            disabled={disabled}
            onSelect={({ id }) =>
              updatePair(index, 'key', String(id))
            }
             popoverProps={{ appendTo: 'window' }}
          />

          <Input
            value={pair.value}
            placeholder="Enter value"
            disabled={disabled}
            onChange={(e) =>
              updatePair(index, 'value', e.target.value)
            }
          />

          <IconButton
            priority="secondary"
            disabled={disabled}
            skin="destructive"
            onClick={() => removePair(index)}
          >
                <Delete/>
          </IconButton>
        </Box>
      ))}

      <Box>
        <IconButton
          priority="secondary"
          disabled={disabled}
          onClick={addPair}
        >
          <Add/>
        </IconButton>
      </Box>
    </Box>
  );
};

export default KeyValueInput;
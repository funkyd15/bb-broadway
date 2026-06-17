import React from 'react';
import { Box, Button, DatePicker, Text } from '@wix/design-system';
import { YYYYMMDD } from './utilities';

type Props = {
    label: string;
    value: Date | null;
    onChange: (date: Date | null) => void;
    mode?: 'start' | 'end';
    width?: string;
    quarterEndMonths?: number[];
    disabled?: boolean;
};



export default function DatePickerWithShortcuts({
    label,
    value,
    onChange,
    mode = 'start',
    width = '240px',
    quarterEndMonths = [3, 6, 9, 12],
    disabled = false,
}: Props) {
    function isFY(date: Date) {
        const month = date.getMonth();
        const day = date.getDate();
        if (month === 3 && day === 1) return true
        if (month === 2 && day === 31) return true
    }
    function isQ(date: Date) {
        const month = date.getMonth(); // 0-based
        const day = date.getDate();

        return (
            (month === 0 && day === 1) || // Jan 1
            (month === 2 && day === 31) || // Mar 31
            (month === 3 && day === 1) || // Apr 1
            (month === 5 && day === 30) || // Jun 30
            (month === 6 && day === 1) || // Jul 1
            (month === 8 && day === 30) || // Sep 30
            (month === 9 && day === 1) || // Oct 1
            (month === 11 && day === 31)    // Dec 31
        );
    }
    const updateDate = (updater: (date: Date) => Date) => {
        if (!value) return;
        onChange(updater(new Date(value)));
    };

  const addDays = (date: Date, days: number): Date => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};
    const addMonths = (date: Date, months: number): Date => {
        const d = new Date(date);
        d.setMonth(d.getMonth() + months);
        return d;
    };

    const addYears = (date: Date, years: number): Date => {
        const d = new Date(date);
        d.setFullYear(d.getFullYear() + years);
        return d;
    };

    const firstDayOfMonth = (year: number, month: number): Date => {
        return new Date(year, month, 1);
    };

    const lastDayOfMonth = (year: number, month: number): Date => {
        return new Date(year, month + 1, 0);
    };

    const getQuarterBoundaries = (year: number): Date[] => {
        return quarterEndMonths.map((monthNumber) => {
            const monthIndex = monthNumber - 1;

            if (mode === 'end') {
                return lastDayOfMonth(year, monthIndex);
            }

            const startMonth = (monthIndex + 1) % 12;

            if (monthNumber === 12) {
                return firstDayOfMonth(year + 1, 0);
            }

            return firstDayOfMonth(year, startMonth);
        });
    };

    const nextQuarter = (date: Date): Date => {
        const year = date.getFullYear();

        const boundaries = [
            ...getQuarterBoundaries(year - 1),
            ...getQuarterBoundaries(year),
            ...getQuarterBoundaries(year + 1),
            ...getQuarterBoundaries(year + 2),
        ].sort((a, b) => a.getTime() - b.getTime());

        return (
            boundaries.find((boundary) => boundary > date) ??
            boundaries[boundaries.length - 1]
        );
    };

    const previousQuarter = (date: Date): Date => {
        const year = date.getFullYear();

        const boundaries = [
            ...getQuarterBoundaries(year - 2),
            ...getQuarterBoundaries(year - 1),
            ...getQuarterBoundaries(year),
            ...getQuarterBoundaries(year + 1),
        ].sort((a, b) => a.getTime() - b.getTime());

        const previous = [...boundaries]
            .reverse()
            .find((boundary) => boundary < date);

        return previous ?? boundaries[0];
    };

    const nextFinancialYear = (date: Date): Date => {
        const year = date.getFullYear();

        if (mode === 'start') {
            const currentBoundary = new Date(year, 3, 1); // 1 Apr

            return date < currentBoundary
                ? currentBoundary
                : new Date(year + 1, 3, 1);
        }

        const currentBoundary = new Date(year, 2, 31); // 31 Mar

        return date < currentBoundary
            ? currentBoundary
            : new Date(year + 1, 2, 31);
    };

    const previousFinancialYear = (date: Date): Date => {
        const year = date.getFullYear();

        if (mode === 'start') {
            const currentBoundary = new Date(year, 3, 1);

            return date > currentBoundary
                ? currentBoundary
                : new Date(year - 1, 3, 1);
        }

        const currentBoundary = new Date(year, 2, 31);

        return date > currentBoundary
            ? currentBoundary
            : new Date(year - 1, 2, 31);
    };

    return (
        <Box direction="vertical" gap="SP2">
            <Text secondary>{label}</Text>

            <DatePicker
                width={width}
                dateStyle="medium"
                value={value}
                onChange={onChange}
                disabled={disabled}
            />

            <Box direction="horizontal" gap="SP1" wrap>
                <Button
                    size="tiny"
                    skin={isFY(value) ? "standard" : "light"}
                    onClick={() => updateDate(previousFinancialYear)}
                    disabled={disabled}

                >
                    -FY
                </Button>

                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addYears(d, -1))}
                    disabled={disabled}

                >
                    -Y
                </Button>

                <Button
                    size="tiny"
                    skin={isQ(value) ? "standard" : "light"}
                    onClick={() => updateDate(previousQuarter)}
                    disabled={disabled}

                >
                    -Q
                </Button>

                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addMonths(d, -1))}
                    disabled={disabled}

                >
                    -M
                </Button>

                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addDays(d, -7))}
                    disabled={disabled}

                >
                    -W
                </Button>

                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addDays(d, -1))}
                    disabled={disabled}

                >
                    -D
                </Button>

                {/* TODAY (center anchor) */}
                <Box paddingLeft="SP2" paddingRight="SP2">
                    <Button
                        size="tiny"
                        skin={YYYYMMDD(value) === YYYYMMDD(new Date()) ? "standard" : "light"}
                        disabled={disabled}

                        onClick={() => onChange(new Date())}
                    >
                        Today
                    </Button>
                </Box>

                 <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addDays(d, 1))}
                    disabled={disabled}

                >
                    +D
                </Button>

                    <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addDays(d, 7))}
                    disabled={disabled}

                >
                    +W
                </Button>


                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addMonths(d, 1))}
                    disabled={disabled}

                >
                    +M
                </Button>

                <Button
                    size="tiny"
                    skin={isQ(value) ? "standard" : "light"}
                    onClick={() => updateDate(nextQuarter)}
                    disabled={disabled}

                >
                    +Q
                </Button>

                <Button
                    size="tiny"
                    skin="light"
                    onClick={() => updateDate((d) => addYears(d, 1))}
                    disabled={disabled}

                >
                    +Y
                </Button>

                <Button
                    size="tiny"
                    skin={isFY(value) ? "standard" : "light"}
                    onClick={() => updateDate(nextFinancialYear)}
                    disabled={disabled}

                >
                    +FY
                </Button>
            </Box>
        </Box>
    );
}
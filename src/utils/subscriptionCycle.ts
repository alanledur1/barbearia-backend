import { addMonths } from 'date-fns';

export type CycleState = {
    cycleStart: Date;
    cycleEnd: Date;
    cutsUsed: number;
};

// Ciclo mensal "flutuante": reinicia sempre na mesma data do ciclo anterior (ex.: assinou dia 15,
// ciclo sempre vira no dia 15 do mês seguinte), não no dia 1. Cortes não usados não acumulam para
// o próximo ciclo — cada virada zera o contador.
export function resolveCurrentCycle(
    lastKnownCycleStart: Date,
    cutsUsedInLastKnownCycle: number,
    now: Date = new Date()
): CycleState {
    let cycleStart = lastKnownCycleStart;
    let cutsUsed = cutsUsedInLastKnownCycle;
    let cycleEnd = addMonths(cycleStart, 1);

    while (cycleEnd <= now) {
        cycleStart = cycleEnd;
        cutsUsed = 0;
        cycleEnd = addMonths(cycleStart, 1);
    }

    return { cycleStart, cycleEnd, cutsUsed };
}

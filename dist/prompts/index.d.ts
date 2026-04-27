import { RunStepsOptions, Step, UserFlowOptions } from "../types";
export declare const buildRunStepsPrompt: ({ auth, userFlow, step, steps, stepIndex, }: Pick<RunStepsOptions, "auth" | "userFlow" | "steps"> & {
    step: Step;
    stepIndex: number;
}) => string;
export declare const buildRunUserFlowPrompt: ({ userFlow, steps, assertion, }: Pick<UserFlowOptions, "userFlow" | "assertion" | "steps">) => string;

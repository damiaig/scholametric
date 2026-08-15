import { computeSubjectTotal, computeSubjectStatus, type ComponentInput, type ComponentScoreInput } from "./grade-computation";

describe("computeSubjectTotal — absent exclusion (SPEC_V0.5.md §2.1)", () => {
  const components: ComponentInput[] = [
    { id: "ca1", weight: 20, maxScore: 20, requiresApproval: false },
    { id: "ca2", weight: 20, maxScore: 20, requiresApproval: false },
    { id: "exam", weight: 60, maxScore: 100, requiresApproval: true },
  ];

  it("excludes an absent component from the weighted total — hand-verified example", () => {
    // CA1 18/20 w20 + CA2 ABSENT + Exam 55/100 w60 = 51, NOT a rescale to 63.75.
    const scores: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 18, isAbsent: false },
      { componentId: "ca2", rawScore: null, isAbsent: true },
      { componentId: "exam", rawScore: 55, isAbsent: false },
    ];
    expect(computeSubjectTotal(components, scores)).toBe(51);
  });

  it("returns 0 when absent for every component", () => {
    const scores: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: null, isAbsent: true },
      { componentId: "ca2", rawScore: null, isAbsent: true },
      { componentId: "exam", rawScore: null, isAbsent: true },
    ];
    expect(computeSubjectTotal(components, scores)).toBe(0);
  });

  it("mixes scored, absent, and not-entered components correctly", () => {
    const scores: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 10, isAbsent: false },
      { componentId: "ca2", rawScore: null, isAbsent: true },
      // exam: no row at all — not entered
    ];
    // Only CA1 contributes: (10/20)*20 = 10.
    expect(computeSubjectTotal(components, scores)).toBe(10);
  });

  it("gives not-entered and absent the SAME total but a DIFFERENT status", () => {
    const notEntered: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 18, isAbsent: false },
      { componentId: "ca2", rawScore: 20, isAbsent: false },
      // exam not entered at all
    ];
    const absentExam: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 18, isAbsent: false },
      { componentId: "ca2", rawScore: 20, isAbsent: false },
      { componentId: "exam", rawScore: null, isAbsent: true },
    ];

    expect(computeSubjectTotal(components, notEntered)).toBe(computeSubjectTotal(components, absentExam));
    expect(computeSubjectStatus(components, notEntered)).toBe("DRAFT");
    expect(computeSubjectStatus(components, absentExam)).toBe("PENDING_APPROVAL");
  });
});

describe("computeSubjectStatus — absent is a decided outcome (SPEC_V0.5.md §2.1)", () => {
  const components: ComponentInput[] = [
    { id: "ca1", weight: 20, maxScore: 20, requiresApproval: false },
    { id: "exam", weight: 80, maxScore: 100, requiresApproval: true },
  ];

  it("reaches PENDING_APPROVAL when the approval-required component is marked absent", () => {
    const scores: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 15, isAbsent: false },
      { componentId: "exam", rawScore: null, isAbsent: true },
    ];
    expect(computeSubjectStatus(components, scores)).toBe("PENDING_APPROVAL");
  });

  it("stays DRAFT when only a non-approval component is absent and exam is genuinely untouched", () => {
    const scores: ComponentScoreInput[] = [{ componentId: "ca1", rawScore: null, isAbsent: true }];
    expect(computeSubjectStatus(components, scores)).toBe("DRAFT");
  });

  it("reaches PENDING_APPROVAL when the approval-required component is scored normally", () => {
    const scores: ComponentScoreInput[] = [
      { componentId: "ca1", rawScore: 15, isAbsent: false },
      { componentId: "exam", rawScore: 70, isAbsent: false },
    ];
    expect(computeSubjectStatus(components, scores)).toBe("PENDING_APPROVAL");
  });
});

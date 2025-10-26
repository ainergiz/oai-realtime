// generated from https://clinicaltrials.gov/study/NCT06690060?cond=Mind%20Body%20Intervention%20for%20Chronic%20Migraine%20Headaches&rank=1

export type StudySection = {
  name: string;
  title: string;
  keywords: string[];
  content: string;
};

export type StudyInfo = {
  sections: StudySection[];
  lastUpdated: string | null;
  source: "study_details.json";
};

export const STUDY_INFO: StudyInfo = {
  sections: [
    {
      name: "overview",
      title: "Overview",
      keywords: ["overview", "study", "trial", "summary", "title"],
      content:
        "Official title: Mind Body Intervention for Chronic Migraine Headaches\nBrief title: Mind Body Intervention for Chronic Migraine Headaches\nClinicalTrials.gov ID: NCT06690060\nSponsor: Beth Israel Deaconess Medical Center\nSummary: The goal of this exploratory study is to test a mind-body interventional approach for the treatment of chronic migraines. The main goal is to obtain feasibility information on the protocol which has been used in other similar conditions. We will also evaluate multiple measurement tools in order to optimize a follow-up pilot study evaluating the impact of the protocol on migraines.\nConditions:\n- Migraines\n- Chronic Pain\nStudy type: INTERVENTIONAL",
    },
    {
      name: "status",
      title: "Status & Timeline",
      keywords: [
        "status",
        "timeline",
        "start",
        "completion",
        "recruit",
        "date",
      ],
      content:
        "Overall status: RECRUITING\nStatus verified: 2025-03\nStart date (ACTUAL): 2024-11-15\nPrimary completion date (ESTIMATED): 2025-11\nStudy completion date (ESTIMATED): 2026-11\nPlanned enrollment: 10 (ESTIMATED)",
    },
    {
      name: "eligibility",
      title: "Eligibility",
      keywords: ["eligibility", "inclusion", "exclusion", "criteria"],
      content:
        "Inclusion Criteria:\n1. Adult (≥ 18 years of age)\n2. Previously diagnosed with migraine headache based on ICHD-3 beta criteria 91\n3. A score of ≥ 50 on the Headache Impact Test-6 self-report survey (moderate impact) 92\n4. Presence of migraine headaches at least 5 days per month\n5. Willing to engage in a Mind-Body intervention\n6. Willing/able to participate in remote sessions\nExclusion Criteria:\n1. Known history or suspicion of headaches due to organic cause (e.g. cancer, sinus infection, head trauma, cerebrovascular disease)\n2. Diagnosis of other chronic pain syndromes that may cloud assessments (e.g. fibromyalgia, chronic idiopathic neck pain)\n3. Diagnosis of cognitive impairment or dementia\n4. Active addiction disorder, e.g. cocaine or IV heroin use, that would interfere with study participation\n5. Major psychiatric comorbidity (e.g., schizophrenia). Anxiety and mild-moderate depression are not considered exclusions.",
    },
    {
      name: "intervention",
      title: "Intervention",
      keywords: ["intervention", "treatment", "arm"],
      content:
        "Interventions:\n- BEHAVIORAL: Mind-Body Intervention – The mind-body intervention will include regular 1 to 2 hour educational sessions and lectures, as well as supplemental reading material. In addition, individualized sessions will be offered each week for students who have additional questions and/or need additional time with the material.",
    },
    {
      name: "outcomes",
      title: "Outcomes",
      keywords: ["outcome", "measure", "endpoint"],
      content:
        "Primary outcomes:\n- MIDAS (baseline, 4, 8, 13 and 20 weeks) – The 7-item Migraine Disability Assessment (MIDAS) is a commonly used and well validated self report survey for assessing migraine-related disability. Questions cover adverse life impacts (missed work, etc.), headache frequency, and headache intensity.\n- HIT-6 (baseline, 4, 8, 13 and 20 weeks) – The Headache Impact Test (HIT-6), a well-validated self reported survey, measures the impact of headaches on 6 aspects of health-related quality of life. A recent study has estimated that a change of 6-7 points was clinically meaningful in a cohort starting with a mean HIT-6 score of 65.0 (severe impact). The HIT-6 is a recommended NIH common data element for headache.\n\nSecondary outcomes:\n- Brief Pain Inventory Questionnaire (Short Form) (baseline, 4, 8, 13 and 20 weeks) – The Brief Pain Inventory questionnaire, which has been validated by Keller et al., will be utilized to gauge pain intensity during the duration of the study. The question about current pain medications will be modified slightly to include current frequency of use.\n- Pain Anxiety Symptom Scale (Short Form 20) (baseline, 4, 8, 13 and 20 weeks) – The short form Pain Anxiety Symptom Scale (PASS-20) is a 20 question survey assessing cognitive, avoidance, fear, and physiological anxiety due to pain. It has been validated by McCracken et al.\n- Somatic Symptoms Score (SSS-8) (baseline, 4, 8, 13 and 20 weeks) – The 8 question Somatic Symptoms Score (SSS-8) is a validated, abbreviated version of the 15 question Patient Health Questionnaire (PHQ)-15. SSS-8 survey questions pertain to pain, the gastrointestinal system, fatigue, and cardiovascular complaints.\n- Migraine Duration (baseline, 4, 8, 13 and 20 weeks) – We will ask participants to estimate how long, on the average, their migraine attacks lasted during the last two weeks.\n- NRS-11 (baseline, 4, 8, 13 and 20 weeks) – The 11-point Numeric Rating Scale (NRS-11) for headache pain intensity asks the patient to rate their pain intensity from 0 (no pain) to 10 (worst pain imaginable). The NRS-11 is recommended by the International Headache Society (IHS) for assessment of this parameter in clinical trials.\n- GAMS (baseline, 4, 8, 13 and 20 weeks) – The single question Global Assessment of Migraine Severity (GAMS) captures a patient's assessment of their overall disease severity. The GAMS is being tested at this stage because there is an abundance of published baseline and variance data for comparison.\n- Feedback on protocol (13 weeks) – We will be receiving qualitative feedback on the protocol",
    },
    {
      name: "contacts",
      title: "Contacts",
      keywords: ["contact", "phone", "email", "investigator"],
      content:
        "Central contacts:\n- Samuel Kukler | CONTACT | 617-754-2882 | skukler@bidmc.harvard.edu\n- Masumi Prasad | CONTACT | 617-754-2882 | mprasad2@bidmc.harvard.edu\n\nStudy officials:\n- Michael Donnino, MD | PRINCIPAL_INVESTIGATOR | Beth Israel Deaconess Medical Center",
    },
    {
      name: "locations",
      title: "Locations",
      keywords: ["location", "site", "where"],
      content:
        "Study locations:\n- Beth Israel Deaconess Medical Center, Boston, Massachusetts, United States – Status: NOT_YET_RECRUITING\n- Beth Israel Deaconess Medical Center, Boston, Massachusetts, United States – Status: RECRUITING",
    },
  ],
  lastUpdated: "2025-03-24",
  source: "study_details.json",
} as const;

const DEFAULT_SECTION_NAMES = new Set(["overview", "status"]);

export const matchStudySections = (question: string): StudySection[] => {
  const normalized = question.toLowerCase();
  const matched = STUDY_INFO.sections.filter((section) =>
    section.keywords.some((keyword) => normalized.includes(keyword)),
  );
  if (matched.length > 0) {
    return matched;
  }
  return STUDY_INFO.sections.filter((section) =>
    DEFAULT_SECTION_NAMES.has(section.name),
  );
};

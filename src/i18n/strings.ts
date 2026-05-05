export type Locale = 'de' | 'en';

export const locales: Locale[] = ['de', 'en'];
export const defaultLocale: Locale = 'de';

type Strings = typeof strings.de;

export const strings = {
  de: {
    siteTitle: 'Jonathan Wrede | ML & Platform Engineer, Dagster, dbt, Kubernetes',
    siteDescription:
      'Jonathan Wrede, ML & Platform Engineer aus Münster. Ich baue produktionsreife ML-Systeme und Dateninfrastruktur für IoT-Flotten: Dagster, dbt, Kubernetes, Python, FastAPI.',
    ogDescription:
      'ML & Platform Engineer aus Münster. Produktionsreife ML-Systeme und Dateninfrastruktur für IoT-Flotten.',
    twitterDescription: 'ML & Platform Engineer aus Münster. Dagster, dbt, Kubernetes, Python.',

    // Header
    initLine: '> initializing_profile.py... Done.',
    role: 'ML & Platform Engineer',
    intro:
      'Ich baue produktionsreife ML-Systeme und Dateninfrastruktur für IoT-Flotten, von Kapazitätsalgorithmen über Analytics-Warehouses bis zum Fleet-Monitoring für 100.000+ Geräte.',
    contact: 'Kontakt',
    cv: 'Lebenslauf',
    contactEmail: 'kontakt@jonathanwrede.de',
    cvFile: '/cv_de.pdf',

    // Sections
    impact: 'Messbare Wirkung',
    stack: 'Eingesetzter Stack',
    projects: 'Ausgewählte Projekterfahrung',
    experience: 'Erfahrung',
    latestWriting: 'Aktuelle Beiträge',
    viewAll: 'Alle ansehen',
    comingSoon: 'Demnächst.',

    // Impact metrics
    metric1: 'IoT-Thermostate überwacht',
    metric2: 'Kundenprojekte mit aktiver Batterieprognose',
    metric3: 'dbt-Modelle im Analytics-Warehouse',
    metric4: 'Speicherreduktion bei SNNI (Thesis)',

    // Case studies (titles + short descriptions)
    cs1Tag: 'GEBÄUDETECHNIK / IoT',
    cs1Title: 'IoT Analytics-Plattform',
    cs1Short:
      'Zentrales Analytics-Warehouse für 100.000+ IoT-Thermostate, von der rohen Gerätetelemetrie zu getesteten dbt-Modellen, Dagster-Orchestrierung und Grafana-Dashboards auf Kubernetes.',

    cs2Title: 'Batterie-Intelligenz-System',
    cs2Short:
      'ML-gestützte Kapazitäts- und Laufzeitvorhersage für 100.000+ IoT-Geräte, als produktionsreife Python-Bibliothek mit Konfidenzintervallen und hardwarespezifischen Defaults.',

    cs3Title: 'Batterie-Operations-Dashboard',
    cs3Short:
      'Internes Ops-Tool für Batterietestmanagement, Kapazitätsmessung und automatisiertes Alerting, FastAPI-Backend, Alpine.js-Frontend, 3-Service Docker-Compose-Setup.',

    cs4ThesisLabel: 'M.Sc.-Thesis · In Arbeit · 2026',
    cs4InProgress: 'In Arbeit',
    cs4Short:
      'Speicher-Profiling und Optimierung für 4 SNNI-Systeme auf BERT und ViT, 61-99 % Speicherreduktion, analytische Modelle und ein Deployability-Framework.',

    // Experience
    expPresent: 'Heute',
    exp1Desc:
      'Batterie-Vorhersage-Algorithmen, IoT-Datenplattform (dbt + Dagster + ArgoCD) und Fleet-Monitoring für 100.000+ Geräte.',
    exp2Desc:
      'Cloud Data Warehouses (Snowflake / BigQuery / Azure Synapse), Python-ETL-Pipelines und Streamlit-Apps mit OAuth SSO für Enterprise-Kunden.',
    exp3Desc:
      'ML-Modelle zur Präsenzerkennung (Python, scikit-learn), PostgreSQL/TimescaleDB-Pipelines, Vue.js-Frontend und internes Labeling-Tool.',
    expEducation: 'Ausbildung',
    expEduDesc:
      'Universität Münster | Thesis: Speicheroptimierung für Secure Neural Network Inference in Transformern',

    // Blog
    blogTitle: 'Blog',
    blogTagline: 'Notizen zu ML-Engineering, Data Platforms und den Developer-Tools, die ich nebenbei baue.',
    blogIndexDesc:
      'Schreiben über ML-Engineering, Data Platforms, Dagster, dbt und Developer Tools.',
    blogEmpty: 'Noch keine Beiträge.',
    blogReadPost: 'Beitrag lesen',
    blogAllPosts: 'Alle Beiträge',
    blogBackHome: '← Zurück zu jonathanwrede.de',
    blogBackHomeShort: 'jonathanwrede.de',

    // Footer / legal
    footerLegal: '© 2025-2026 Jonathan Wrede.',

    // Misc
    cs4MetaDesc: 'M.Sc.-Thesis · In Arbeit · 2026',

    htmlLang: 'de',
  },

  en: {
    siteTitle: 'Jonathan Wrede | ML & Platform Engineer, Dagster, dbt, Kubernetes',
    siteDescription:
      'Jonathan Wrede, ML & Platform Engineer based in Münster, Germany. I build production-grade ML systems and data infrastructure for IoT fleets: Dagster, dbt, Kubernetes, Python, FastAPI.',
    ogDescription:
      'ML & Platform Engineer based in Münster, Germany. Production-grade ML systems and data infrastructure for IoT fleets.',
    twitterDescription: 'ML & Platform Engineer in Münster. Dagster, dbt, Kubernetes, Python.',

    initLine: '> initializing_profile.py... Done.',
    role: 'ML & Platform Engineer',
    intro:
      'I build production-grade ML systems and data infrastructure for IoT fleets, capacity prediction algorithms, analytics warehouses, and fleet monitoring for 100,000+ devices.',
    contact: 'Get in touch',
    cv: 'Resume',
    contactEmail: 'contact@jonathanwrede.de',
    cvFile: '/cv_intl.pdf',

    impact: 'Measurable Impact',
    stack: 'Production Stack',
    projects: 'Selected Project Experience',
    experience: 'Experience',
    latestWriting: 'Latest writing',
    viewAll: 'View all',
    comingSoon: 'Coming soon.',

    metric1: 'IoT thermostats monitored',
    metric2: 'customer sites with active battery prediction',
    metric3: 'dbt models in analytics warehouse',
    metric4: 'Memory reduction for SNNI (thesis)',

    cs1Tag: 'BUILDING TECH / IoT',
    cs1Title: 'IoT Analytics Platform',
    cs1Short:
      'Central analytics warehouse for 100,000+ IoT thermostats, from raw device telemetry to tested dbt models, Dagster orchestration, and Grafana dashboards on Kubernetes.',

    cs2Title: 'Battery Intelligence System',
    cs2Short:
      'ML-powered capacity and runtime prediction for 100,000+ IoT devices, shipped as a production Python library with confidence intervals and per-hardware defaults.',

    cs3Title: 'Battery Operations Dashboard',
    cs3Short:
      'Internal ops tool for battery test management, capacity measurement, and automated alerting, FastAPI backend, Alpine.js frontend, 3-service Docker Compose setup.',

    cs4ThesisLabel: 'M.Sc. Thesis · In Progress · 2026',
    cs4InProgress: 'In progress',
    cs4Short:
      'Memory profiling and optimization across 4 SNNI systems on BERT and ViT, 61-99% memory reduction, analytical models, and a deployability framework.',

    expPresent: 'Present',
    exp1Desc:
      'Battery prediction algorithms, IoT data platform (dbt + Dagster + ArgoCD), and fleet monitoring for 100,000+ devices.',
    exp2Desc:
      'Cloud data warehouses (Snowflake / BigQuery / Azure Synapse), Python ETL pipelines, and Streamlit apps with OAuth SSO for enterprise clients.',
    exp3Desc:
      'Presence-detection ML models (Python, scikit-learn), PostgreSQL/TimescaleDB pipelines, Vue.js frontend, and internal labeling tool.',
    expEducation: 'Education',
    expEduDesc:
      'University of Münster | Thesis: Optimizing memory footprints for secure neural network inference in transformers',

    blogTitle: 'Blog',
    blogTagline:
      'Notes on ML engineering, data platforms, and the developer tools I build along the way.',
    blogIndexDesc:
      'Notes on ML engineering, data platforms, Dagster, dbt, and developer tools.',
    blogEmpty: 'No posts yet.',
    blogReadPost: 'Read post',
    blogAllPosts: 'All posts',
    blogBackHome: '← Back to jonathanwrede.de',
    blogBackHomeShort: 'jonathanwrede.de',

    footerLegal: '© 2025-2026 Jonathan Wrede.',

    cs4MetaDesc: 'M.Sc. Thesis · In Progress · 2026',

    htmlLang: 'en',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export function t(locale: Locale): Strings {
  return strings[locale] ?? strings.de;
}

export function homePath(locale: Locale): string {
  return locale === 'de' ? '/' : `/${locale}/`;
}

export function blogIndexPath(locale: Locale): string {
  return locale === 'de' ? '/blog/' : `/${locale}/blog/`;
}

export function blogPostPath(locale: Locale, slug: string): string {
  return locale === 'de' ? `/blog/${slug}/` : `/${locale}/blog/${slug}/`;
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'de' ? 'en' : 'de';
}

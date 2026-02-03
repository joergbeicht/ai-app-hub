/** Einzelne App in der Konfiguration */
export interface AppEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  iconType: 'image' | 'mat-icon';
  icon: string;
}

/** Struktur von konfiguration.json */
export interface AppConfig {
  defaultIcon: string;
  apps: AppEntry[];
}

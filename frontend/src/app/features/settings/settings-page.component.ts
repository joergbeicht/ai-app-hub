import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TranslocoPipe, TranslocoService, provideTranslocoScope } from '@jsverse/transloco';
import { debounceTime, map } from 'rxjs/operators';
import { ConfigService } from '../../core/services/config.service';
import { LocalePreferencesService } from '../../core/services/locale-preferences.service';
import { AuthService } from '../../core/services/auth.service';
import { UserManagementComponent } from './user-management/user-management.component';
import {
  appDisplayDescription,
  appDisplayName,
  newAppEntry,
  withLocaleText,
  type AppEntry,
} from '../../core/models/app-config.model';
import type { AppLocale } from '../../core/models/locale.model';
import {
  DEFAULT_SETTINGS_TAB,
  isSettingsTab,
  settingsIndexToTab,
  settingsTabToIndex,
} from './settings-tab';

type AppFormGroup = FormGroup<{
  id: FormControl<string>;
  name: FormControl<string>;
  description: FormControl<string>;
  url: FormControl<string>;
  iconType: FormControl<'mat-icon' | 'image'>;
  icon: FormControl<string>;
  enabled: FormControl<boolean>;
}>;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    DragDropModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTabsModule,
    TranslocoPipe,
    UserManagementComponent,
  ],
  providers: [provideTranslocoScope('settings')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- activeLanguage() keeps OnPush + mat-tab content in sync on lang change -->
    @let lang = activeLanguage();
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-card-title>{{ 'settings.title' | transloco: {} : lang }}</mat-card-title>
        <mat-card-subtitle>{{ 'settings.subtitle' | transloco: {} : lang }}</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <mat-tab-group
          animationDuration="200ms"
          class="settings-tabs"
          [selectedIndex]="selectedTabIndex()"
          (selectedIndexChange)="onTabIndexChange($event)"
        >
          <mat-tab>
            <ng-template mat-tab-label>{{ 'settings.tabs.general' | transloco: {} : lang }}</ng-template>
            <div class="tab-panel">
              <p class="tab-subtitle">{{ 'settings.general.subtitle' | transloco: {} : lang }}</p>
              <form [formGroup]="generalForm" class="general-form" (ngSubmit)="saveGeneral()">
                <mat-form-field appearance="outline" class="field-language">
                  <mat-label>{{ 'settings.general.defaultLanguage' | transloco: {} : lang }}</mat-label>
                  <mat-select formControlName="defaultLanguage">
                    @for (locale of locales; track locale.code) {
                      <mat-option [value]="locale.code">{{ locale.nativeLabel }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint>{{ 'settings.general.defaultLanguageHint' | transloco: {} : lang }}</mat-hint>
                </mat-form-field>
                <div class="tab-actions">
                  <button mat-raised-button color="primary" type="submit">
                    <mat-icon>save</mat-icon>
                    {{ 'settings.save' | transloco: {} : lang }}
                  </button>
                  <a mat-button routerLink="/">{{ 'settings.cancel' | transloco: {} : lang }}</a>
                </div>
              </form>
            </div>
          </mat-tab>

          <mat-tab>
            <ng-template mat-tab-label>{{ 'settings.tabs.apps' | transloco: {} : lang }}</ng-template>
            <div class="tab-panel">
              <p class="tab-subtitle">{{ 'settings.apps.subtitle' | transloco: {} : lang }}</p>
              <div class="actions">
                <button mat-raised-button color="primary" type="button" (click)="addApp()">
                  <mat-icon>add</mat-icon>
                  {{ 'settings.addApp' | transloco: {} : lang }}
                </button>
                <button mat-stroked-button type="button" (click)="resetToAsset()">
                  <mat-icon>restore</mat-icon>
                  {{ 'settings.resetToDefault' | transloco: {} : lang }}
                </button>
                <a mat-button routerLink="/">{{ 'settings.cancel' | transloco: {} : lang }}</a>
              </div>

              <form
                [formGroup]="appsForm"
                class="app-list"
                cdkDropList
                (cdkDropListDropped)="onAppDrop($event)"
              >
                @for (
                  appGroup of appGroups;
                  track trackAppRow(appGroup, activeLanguage());
                  let i = $index
                ) {
                  <div
                    class="app-row"
                    [class.app-row--disabled]="!appGroup.controls.enabled.value"
                    [formGroup]="appGroup"
                    cdkDrag
                  >
                    <div class="app-row-toolbar">
                      <button
                        type="button"
                        class="drag-handle"
                        cdkDragHandle
                        [attr.aria-label]="'settings.apps.reorder' | transloco: {} : lang"
                      >
                        <mat-icon>drag_indicator</mat-icon>
                      </button>
                      <mat-slide-toggle
                        formControlName="enabled"
                        color="primary"
                        (change)="onEnabledToggle()"
                      >
                        {{ 'settings.apps.enabled' | transloco: {} : lang }}
                      </mat-slide-toggle>
                      <span class="app-row-spacer"></span>
                      <button
                        mat-icon-button
                        color="warn"
                        type="button"
                        (click)="removeApp(i)"
                        [attr.aria-label]="'settings.remove' | transloco: {} : lang"
                      >
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                    <div class="app-row-fields">
                      <mat-form-field appearance="outline" class="field-name">
                        <mat-label>{{ 'settings.field.name' | transloco: {} : lang }}</mat-label>
                        <input matInput formControlName="name" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="field-desc">
                        <mat-label>{{
                          'settings.field.description' | transloco: {} : lang
                        }}</mat-label>
                        <input matInput formControlName="description" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="field-url">
                        <mat-label>{{ 'settings.field.url' | transloco: {} : lang }}</mat-label>
                        <input matInput formControlName="url" />
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="field-icon-type">
                        <mat-label>{{
                          'settings.field.iconType' | transloco: {} : lang
                        }}</mat-label>
                        <mat-select formControlName="iconType">
                          <mat-option value="mat-icon">{{
                            'settings.field.iconTypeMatIcon' | transloco: {} : lang
                          }}</mat-option>
                          <mat-option value="image">{{
                            'settings.field.iconTypeImage' | transloco: {} : lang
                          }}</mat-option>
                        </mat-select>
                      </mat-form-field>
                      <mat-form-field appearance="outline" class="field-icon">
                        <mat-label>
                          {{
                            (appGroup.controls.iconType.value === 'mat-icon'
                              ? 'settings.field.iconName'
                              : 'settings.field.iconPath'
                            ) | transloco: {} : lang
                          }}
                        </mat-label>
                        <input matInput formControlName="icon" />
                      </mat-form-field>
                    </div>
                  </div>
                }
              </form>
            </div>
          </mat-tab>

          @if (isAdmin()) {
            <mat-tab>
              <ng-template mat-tab-label>{{ 'settings.tabs.users' | transloco: {} : lang }}</ng-template>
              <div class="tab-panel">
                <app-user-management></app-user-management>
              </div>
            </mat-tab>
          }
        </mat-tab-group>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .settings-card {
        max-width: 960px;
        margin: 0 auto;
      }
      .settings-tabs {
        margin-top: 0.5rem;
      }
      .tab-panel {
        padding: 1.25rem 0 0.5rem;
      }
      .tab-subtitle {
        margin: 0 0 1.25rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }
      .general-form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-width: 420px;
      }
      .field-language {
        width: 100%;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .tab-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 1.25rem;
        flex-wrap: wrap;
        align-items: center;
      }
      .app-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .app-row {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
        border: 1px solid var(--border-primary);
      }
      .app-row--disabled {
        opacity: 0.65;
      }
      .app-row-toolbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .app-row-spacer {
        flex: 1 1 auto;
      }
      .drag-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-secondary);
        cursor: grab;
      }
      .drag-handle:active {
        cursor: grabbing;
      }
      .drag-handle:hover {
        color: var(--primary-400);
        background: color-mix(in srgb, var(--primary-500) 12%, transparent);
      }
      .cdk-drag-preview {
        box-sizing: border-box;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      .cdk-drag-placeholder {
        opacity: 0.35;
      }
      .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
      .app-list.cdk-drop-list-dragging .app-row:not(.cdk-drag-placeholder) {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
      .app-row-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        align-items: start;
      }
      .field-name {
        grid-column: 1;
      }
      .field-desc {
        grid-column: 2;
      }
      .field-url {
        grid-column: 1 / -1;
      }
      .field-icon-type {
        grid-column: 1;
      }
      .field-icon {
        grid-column: 2;
      }
      @media (max-width: 599px) {
        .app-row-fields {
          grid-template-columns: 1fr;
        }
        .field-name,
        .field-desc,
        .field-url,
        .field-icon-type,
        .field-icon {
          grid-column: 1 / -1;
        }
      }
      mat-form-field {
        width: 100%;
      }
    `,
  ],
})
export class SettingsPageComponent implements OnInit {
  private readonly configService = inject(ConfigService);
  private readonly localePreferences = inject(LocalePreferencesService);
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly locales = this.localePreferences.availableLocales;
  readonly activeLanguage = this.localePreferences.activeLanguage;
  /** Steuert nur die Sichtbarkeit des "Benutzerverwaltung"-Tabs (UX) - die eigentliche
   * Durchsetzung passiert serverseitig im `app-hub-backend` (`RolesGuard`, siehe ADR-6). */
  readonly isAdmin = computed(() => this.authService.currentUser()?.role === 'Administrator');

  /** Full localized app drafts; the form shows the active-locale slice. */
  private appDrafts: AppEntry[] = [];
  private contentLocale: AppLocale = this.localePreferences.activeLanguage();
  /** Skip auto-persist while programmatically rebuilding the apps form. */
  private suppressAppsPersist = false;

  readonly selectedTabIndex = toSignal(
    this.route.paramMap.pipe(
      map((params) => {
        const tab = params.get('tab');
        if (!isSettingsTab(tab)) {
          return settingsTabToIndex(DEFAULT_SETTINGS_TAB);
        }
        return settingsTabToIndex(tab);
      }),
    ),
    { initialValue: settingsTabToIndex(DEFAULT_SETTINGS_TAB) },
  );

  readonly generalForm = this.fb.group({
    defaultLanguage: this.fb.control<AppLocale>(this.localePreferences.defaultLanguage(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly appsForm = new FormGroup({
    apps: this.fb.array<AppFormGroup>([]),
  });

  get appGroups(): AppFormGroup[] {
    return this.appsForm.controls.apps.controls;
  }

  constructor() {
    effect(() => {
      const lang = this.activeLanguage();
      untracked(() => this.syncAppsFormToLocale(lang));
    });

    // Keep the settings language control in sync when the header switcher persists a locale.
    effect(() => {
      const persisted = this.localePreferences.defaultLanguage();
      untracked(() => {
        const control = this.generalForm.controls.defaultLanguage;
        if (control.value !== persisted) {
          control.setValue(persisted, { emitEvent: false });
        }
      });
    });
  }

  ngOnInit(): void {
    const tab = this.route.snapshot.paramMap.get('tab');
    if (!isSettingsTab(tab) || (tab === 'users' && !this.isAdmin())) {
      void this.router.navigate(['/settings', DEFAULT_SETTINGS_TAB], { replaceUrl: true });
    }

    this.generalForm.patchValue({
      defaultLanguage: this.localePreferences.defaultLanguage(),
    });

    this.generalForm.controls.defaultLanguage.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((locale) => {
        this.localePreferences.previewLanguage(locale);
      });

    // Leaving settings without Save: drop the preview and restore the persisted default.
    // After Save, persisted === last choice, so restore is a no-op for the active UI language.
    this.destroyRef.onDestroy(() => {
      this.localePreferences.restorePersistedLanguage();
    });

    this.appsForm.valueChanges
      .pipe(debounceTime(400), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.suppressAppsPersist) {
          return;
        }
        this.persistAppsDraft();
      });

    void this.configService.load().then(() => {
      this.setApps(this.configService.apps());
    });
  }

  onTabIndexChange(index: number): void {
    const tab = settingsIndexToTab(index);
    void this.router.navigate(['/settings', tab]);
  }

  trackAppRow(appGroup: AppFormGroup, lang: string): string {
    return `${appGroup.controls.id.value}:${lang}`;
  }

  saveGeneral(): void {
    if (this.generalForm.invalid) {
      return;
    }
    const locale = this.generalForm.controls.defaultLanguage.value;
    this.localePreferences.saveDefaultLanguage(locale);
    this.snackBar.open(this.transloco.translate('settings.toast.generalSaved'), undefined, {
      duration: 2000,
    });
  }

  addApp(): void {
    const locale = this.activeLanguage();
    this.flushFormIntoDrafts(locale);
    const entry = newAppEntry({
      id: `app-${Date.now()}`,
      name: this.transloco.translate('settings.newAppName'),
      description: '',
      url: 'http://localhost:4200',
      iconType: 'mat-icon',
      icon: 'apps',
      locale,
    });
    this.appDrafts = [...this.appDrafts, entry];
    this.suppressAppsPersist = true;
    this.appsForm.controls.apps.push(this.buildAppGroup(entry, locale));
    this.suppressAppsPersist = false;
    this.persistAppsDraft();
  }

  removeApp(index: number): void {
    this.flushFormIntoDrafts(this.contentLocale);
    this.appDrafts = this.appDrafts.filter((_, i) => i !== index);
    this.suppressAppsPersist = true;
    this.appsForm.controls.apps.removeAt(index);
    this.suppressAppsPersist = false;
    this.persistAppsDraft();
  }

  onAppDrop(event: CdkDragDrop<AppFormGroup[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    this.flushFormIntoDrafts(this.contentLocale);
    moveItemInArray(this.appDrafts, event.previousIndex, event.currentIndex);
    this.patchFormFromDrafts(this.contentLocale);
    this.persistAppsDraft();
  }

  /** Persist enable/disable immediately; refresh OnPush disabled-row styling. */
  onEnabledToggle(): void {
    this.persistAppsDraft();
    this.cdr.markForCheck();
  }

  resetToAsset(): void {
    this.configService.resetToAsset();
    void this.configService.load(true).then(() => {
      this.setApps(this.configService.apps());
      this.snackBar.open(this.transloco.translate('settings.toast.resetDone'), undefined, {
        duration: 2000,
      });
    });
  }

  /** Flush form → drafts → ConfigService/localStorage. */
  private persistAppsDraft(): void {
    this.flushFormIntoDrafts(this.contentLocale);
    this.configService.saveApps(this.appDrafts);
  }

  private syncAppsFormToLocale(lang: AppLocale): void {
    if (this.appDrafts.length === 0) {
      this.contentLocale = lang;
      return;
    }
    if (lang === this.contentLocale) {
      return;
    }
    this.flushFormIntoDrafts(this.contentLocale);
    this.configService.saveApps(this.appDrafts);
    this.contentLocale = lang;
    this.patchFormFromDrafts(lang);
  }

  private setApps(apps: AppEntry[]): void {
    this.appDrafts = apps.map((app) => ({
      ...app,
      name: { ...app.name },
      description: { ...app.description },
    }));
    this.contentLocale = this.activeLanguage();
    this.patchFormFromDrafts(this.contentLocale);
  }

  private flushFormIntoDrafts(locale: AppLocale): void {
    const rows = this.appsForm.getRawValue().apps;
    const previousById = new Map(this.appDrafts.map((app) => [app.id, app]));
    this.appDrafts = rows.map((row) => {
      const previous = previousById.get(row.id);
      const base =
        previous ??
        newAppEntry({
          id: row.id,
          name: row.name,
          description: row.description,
          url: row.url,
          iconType: row.iconType,
          icon: row.icon,
          locale,
        });
      return {
        id: row.id,
        name: withLocaleText(base.name, locale, row.name),
        description: withLocaleText(base.description, locale, row.description),
        url: row.url,
        iconType: row.iconType,
        icon: row.icon,
        enabled: row.enabled,
      };
    });
  }

  private patchFormFromDrafts(locale: AppLocale): void {
    this.suppressAppsPersist = true;
    this.appsForm.controls.apps.clear();
    for (const app of this.appDrafts) {
      this.appsForm.controls.apps.push(this.buildAppGroup(app, locale));
    }
    this.suppressAppsPersist = false;
  }

  private buildAppGroup(app: AppEntry, locale: AppLocale): AppFormGroup {
    return this.fb.group({
      id: this.fb.control(app.id, { nonNullable: true }),
      name: this.fb.control(appDisplayName(app, locale), {
        nonNullable: true,
        validators: [Validators.required],
      }),
      description: this.fb.control(appDisplayDescription(app, locale), { nonNullable: true }),
      url: this.fb.control(app.url, { nonNullable: true, validators: [Validators.required] }),
      iconType: this.fb.control(app.iconType, { nonNullable: true }),
      icon: this.fb.control(app.icon, { nonNullable: true }),
      enabled: this.fb.control(app.enabled, { nonNullable: true }),
    });
  }
}

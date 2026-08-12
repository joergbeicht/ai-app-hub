export class TabletAuthResultDto {
  sessionToken!: string;
  deviceToken!: string;
  expiresIn!: number;
  displayName!: string;
  userPrincipalName!: string;
  /** Aus dem Entra-ID-Token des ROPC-Austauschs (siehe `RopcTokenService`) - dieselben App Roles wie bei einem normalen PC-Login (ADR-6). */
  roles!: string[];
}

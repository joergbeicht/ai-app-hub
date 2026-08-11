/**
 * Erlaubte Zeichen/Länge für gescannte Ausweis-Barcodes (siehe ADR-7, "Weg A"). Rein defensiv
 * gegen OData-Filter-Injection und offensichtlichen Unsinn - kein Abgleich mit einer konkreten
 * Barcode-Symbologie, da das je Kunde unterschiedlich sein kann.
 */
export const BADGE_CODE_PATTERN = /^[A-Za-z0-9-]{3,64}$/;

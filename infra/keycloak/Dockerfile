# syntax=docker/dockerfile:1.7
# Keycloak mit E-Mail-OTP als zweitem Faktor (ADR-21). Keycloak hat keinen eingebauten
# E-Mail-OTP-Authenticator; die Erweiterung ist auf Version und Prüfsumme gepinnt und muss bei
# jedem Keycloak-Update auf den passenden Build (`-KC<version>`) mitgezogen werden.
FROM quay.io/keycloak/keycloak:26.8.1

ADD --chown=keycloak:keycloak \
    --checksum=sha256:168484132ec6bd0c33d0a38afc8e2a908ef07fcfc33d00065cf8cebf47f8338d \
    https://github.com/mesutpiskin/keycloak-2fa-email-authenticator/releases/download/v26.7.2/keycloak-2fa-email-authenticator-v26.7.2-KC26.8.0.jar \
    /opt/keycloak/providers/keycloak-2fa-email-authenticator.jar

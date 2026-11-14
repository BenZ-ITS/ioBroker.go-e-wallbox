![Logo](../../admin/goe-wallbox.png)

# ioBroker.goe-wallbox

[English](../../README.md) · **Deutsch**

Schlanker Geräte-Spiegel für **go-e Charger** Wallboxen.

Der Adapter stellt die Werte der offiziellen lokalen HTTP-API v2 als ioBroker-Datenpunkte bereit – lesend und, wo die
API es erlaubt, schreibend. Er enthält **keine eigene Ladelogik**: keine Überschussregelung, keine Zeitpläne. Was die
Wallbox tut, entscheidest du, deine eigenen Skripte oder die Wallbox selbst.

Dies ist ein unabhängiges Projekt, von Grund auf neu geschrieben anhand der
[offiziellen go-e-API-Dokumentation](https://github.com/goecharger/go-eCharger-API-v2). Es steht in keiner Verbindung
zur go-e GmbH.

## Wofür er gedacht ist

Nimm diesen Adapter, wenn du direkten Zugriff auf die Wallbox willst – zum Beispiel auf den erzwungenen Zustand
(`frc`), das in der App gesetzte Energielimit (`dwo`) oder den Grund, warum die Wallbox gerade lädt oder nicht
(`modelStatus`) – und deine eigene Logik mitbringst. Jeder API-Schlüssel ohne eigenen Datenpunkt lässt sich unter
„Zusätzliche API-Schlüssel“ eintragen und erscheint dann unter `raw`.

Wenn du eine fertige PV-Überschussregelung suchst, ist ein Adapter mit eingebauter Steuerung die bessere Wahl.

## Voraussetzungen

- go-e Charger mit **lokaler HTTP-API v2** (in der go-e-App einschalten). Entwickelt und getestet mit einem
  go-eCharger V4, Firmware 60.5.
- Node.js 22 oder neuer, js-controller 6.0.11 oder neuer, Admin 7.6.17 oder neuer.

Unterstützung für die ältere API v1 (ältere Hardware) ist geplant; die Struktur der Datenpunkte bleibt dabei gleich.

## Installation

### 1. Wallbox vorbereiten

In der go-e-App die **lokale HTTP-API v2** einschalten. Der Wallbox im Router eine feste IP-Adresse geben oder ihren
Hostnamen verwenden.

### 2. Adapter installieren

In der Admin-Oberfläche **Adapter** öffnen, nach **goe-wallbox** suchen und installieren. „Instanz erstellen“
angehakt lassen.

Der Adapter ist noch nicht im ioBroker-Adapterverzeichnis gelistet. Bis dahin, und für Testversionen, wird er aus
einer Paketdatei (`.tgz`) installiert:

1. Die Paketdatei `iobroker.goe-wallbox-<Version>.tgz` aus den Releases dieses Repos laden. Die Datei nicht
   umbenennen: ioBroker leitet den Adapternamen aus dem Dateinamen ab. Selbst bauen lässt sie sich wie in
   [docs/DEVELOPMENT.md](../DEVELOPMENT.md#installing-a-package-file) beschrieben.
2. **Adapter** öffnen und den **Expertenmodus** einschalten (Kopf-Symbol unten im Seitenmenü). Er gilt nur für die
   aktuelle Browsersitzung.
3. In der Leiste auf das **GitHub-Symbol** klicken („Installieren aus eigener URL“) und einen dieser Reiter wählen:
    - **Aus Datei**: die `.tgz` auf dem eigenen Rechner auswählen.
    - **Benutzerdefiniert**: eine Adresse der `.tgz` eintragen, die der ioBroker-Host erreichen kann, oder den Pfad
      der Datei auf dem ioBroker-Host.
4. „Instanz erstellen, wenn noch keine existiert“ angehakt lassen und **Installieren** klicken. Die rote Warnung im
   Dialog erscheint bei jeder Installation außerhalb des offiziellen Verzeichnisses.

Auf der Kommandozeile des ioBroker-Hosts geht dasselbe mit:

```bash
iobroker url /pfad/zu/iobroker.goe-wallbox-<Version>.tgz
iobroker add goe-wallbox
```

Die Installation direkt über die Adresse des GitHub-Repos funktioniert **nicht**: Das Repo enthält nur die
TypeScript-Quellen, der übersetzte Code steckt in der Paketdatei.

### 3. Instanz einrichten

1. **Instanzen** öffnen und die Einstellungen von `goe-wallbox.0` aufrufen.
2. Je Wallbox eine Zeile mit IP-Adresse oder Hostname anlegen.
3. Für den ersten Start empfohlen: **Nur-Lesen-Modus** anhaken. Der Adapter liest dann nur.
4. Speichern. Im Log steht für jede Wallbox `connected`, und die Datenpunkte erscheinen unter
   `goe-wallbox.0.<Seriennummer>`.
5. Um die Wallbox über die Datenpunkte zu steuern, den Nur-Lesen-Modus wieder ausschalten.

Ist eine Wallbox nicht erreichbar, nennt das Log den Grund. `HTTP 404` bedeutet, dass die lokale HTTP-API v2 nicht
eingeschaltet ist.

### Aktualisieren

Den Adapter auf der Seite **Adapter** aktualisieren; bei einer Installation aus einer Paketdatei die Paketdatei der
neueren Version auf demselben Weg installieren. Instanz und Einstellungen bleiben erhalten.

### Deinstallieren

Die Instanz auf der Seite **Instanzen** löschen und danach den Adapter auf der Seite **Adapter**, oder auf dem Host
`iobroker del goe-wallbox` ausführen.

## Konfiguration

| Einstellung               | Bedeutung                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Wallboxen                 | Eine Zeile je Wallbox: IP-Adresse oder Hostname und ein optionaler Name                                      |
| Abfrageintervall          | Sekunden zwischen zwei Statusabfragen (Standard 5). Die Wallbox wertet ihre Logik einmal pro Sekunde aus     |
| Zeitlimit je Anfrage      | Sekunden, nach denen eine Anfrage als fehlgeschlagen gilt (Standard 4)                                       |
| Nur-Lesen-Modus           | Der Adapter sendet nie etwas an die Wallboxen. Geschriebene Datenpunkte springen auf den gemeldeten Wert zurück |
| Zusätzliche API-Schlüssel | Durch Komma getrennte Schlüssel aus der API-Dokumentation; sie erscheinen unverarbeitet unter `raw`          |

## Datenpunkte

Jede Wallbox bekommt ein Gerät, das nach ihrer Seriennummer benannt ist: `goe-wallbox.0.<Seriennummer>.…`.
Ein Datenpunkt wird nur angelegt, wenn die Firmware den zugehörigen Schlüssel tatsächlich liefert.

| Datenpunkt                   | API-Schlüssel | Schreibbar | Bedeutung                                                                       |
| ---------------------------- | ------------- | :--------: | ------------------------------------------------------------------------------- |
| `info.online`                | –             |            | Die Wallbox hat auf die letzte Anfrage geantwortet                              |
| `info.serial` / `model` / `firmware` / `variant` | `sse` `typ` `fwv` `var` | | Gerätekennung                                          |
| `info.friendlyName`          | `fna`         |     ✔      | Gerätename                                                                      |
| `info.rssi`                  | `rssi`        |            | WLAN-Signalstärke in dBm                                                        |
| `info.uptime`                | `rbt`         |            | Minuten seit dem Start                                                          |
| `car.state`                  | `car`         |            | 1 = kein Auto, 2 = lädt, 3 = wartet auf Auto, 4 = fertig, 5 = Fehler            |
| `car.connected`              | `car`         |            | `true` bei Fahrzeugstatus 2, 3 und 4                                            |
| `car.chargedEnergy`          | `wh`          |            | Wh seit dem Anstecken                                                           |
| `car.cableCurrentLimit`      | `cbl`         |            | Strombegrenzung des Kabels in A                                                 |
| `car.cableLock`              | `cus`         |            | Zustand der Kabelverriegelung                                                   |
| `charging.allowed`           | `alw`         |            | Das Auto darf gerade laden                                                      |
| `charging.reason`            | `modelStatus` |            | Warum geladen wird oder nicht (erzwungener Zustand, Energielimit, Phasenwechsel …) |
| `charging.forceState`        | `frc`         |     ✔      | 0 = neutral, 1 = aus, 2 = an                                                    |
| `charging.current`           | `amp`         |     ✔      | Angeforderter Ladestrom in A (6–32)                                             |
| `charging.currentLimit`      | `ama`         |     ✔      | Obergrenze für den Ladestrom in A                                               |
| `charging.allowedCurrent`    | `acu`         |            | Strom, den das Auto gerade ziehen darf                                          |
| `charging.phaseSwitchMode`   | `psm`         |     ✔      | 0 = automatisch, 1 = 1-phasig erzwingen, 2 = 3-phasig erzwingen                 |
| `charging.energyLimit`       | `dwo`         |     ✔      | Energielimit je Ladevorgang in Wh; `0` = kein Limit                             |
| `charging.logicMode`         | `lmo`         |     ✔      | 3 = Standard (Basic), 4 = Awattar (Eco), 5 = automatischer Stopp (Daily Trip)   |
| `charging.error`             | `err`         |            | Fehlercode                                                                      |
| `energy.power`, `energy.powerL1…L3` | `nrg`  |            | Ladeleistung in W, gesamt und je Phase                                          |
| `energy.voltageL1…L3`        | `nrg`         |            | Spannung in V                                                                   |
| `energy.currentL1…L3`        | `nrg`         |            | Strom in A                                                                      |
| `energy.total`               | `eto`         |            | Gesamtenergie in Wh                                                             |
| `energy.frequency`           | `fhz`         |            | Netzfrequenz in Hz                                                              |
| `energy.phases`              | `pha`         |            | Anzahl zum Fahrzeug geschalteter Phasen (0 = Schütz offen)                      |
| `temperature.sensor1/2`      | `tma`         |            | Temperaturen in °C                                                              |
| `pv.useSurplus`              | `fup`         |     ✔      | PV-Überschussfunktion der Wallbox ein/aus                                       |
| `pv.startingPower`           | `fst`         |     ✔      | Startleistung für das Überschussladen in W                                      |
| `pv.gridPower` / `pvPower` / `batteryPower` | `pgrid` `ppv` `pakku` | | Leistungswerte, die der Wallbox gerade bekannt sind        |
| `settings.accessControl`     | `acs`         |     ✔      | 0 = offen, 1 = warten                                                           |
| `settings.cableUnlock`       | `ust`         |     ✔      | 0 = normal, 1 = automatisch entriegeln, 2 = immer verriegeln                    |
| `settings.ledBrightness`     | `lbr`         |     ✔      | 0–255                                                                           |
| `settings.minChargingCurrent`| `mca`         |     ✔      | Minimaler Ladestrom in A                                                        |
| `settings.awattarMaxPrice`   | `awp`         |     ✔      | Höchstpreis im Eco-Modus in ct                                                  |
| `settings.automaticStopEnergy` / `automaticStopTime` | `ate` `att` | ✔ | Daily Trip: Energie in Wh und Uhrzeit in Sekunden seit Mitternacht |
| `raw.<Schlüssel>`            | beliebig      |            | Zusätzliche Schlüssel; Objekte und Listen als JSON-Text                         |

### Schreiben

Einen schreibbaren Datenpunkt mit `ack = false` setzen. Der Adapter prüft den Wert, sendet ihn an die Wallbox und liest
eine Sekunde später den Status neu; bestätigt wird der Datenpunkt mit dem Wert, den die Wallbox meldet. Ist der Wert
ungültig, lehnt die Wallbox ihn ab oder ist sie nicht erreichbar, wird eine Warnung protokolliert und der Datenpunkt
springt auf den zuletzt gemeldeten Wert zurück.

Messwerte werden gerundet (Leistung und Spannung auf ganze Zahlen, Strom auf 0,1 A), und Datenpunkte werden nur bei
geänderten Werten aktualisiert. Ein kurzes Abfrageintervall überflutet das System deshalb nicht.

## Entwicklung

```bash
npm install
npm run check   # Typprüfung
npm run lint
npm test        # Unit- und Pakettests
npm run test:integration   # startet den Adapter in einem echten js-controller
```

Aufbau, Konventionen und der Ablauf einer Veröffentlichung stehen (auf Englisch) in
[docs/DEVELOPMENT.md](../DEVELOPMENT.md).

## Änderungen und Lizenz

Änderungsprotokoll und Lizenztext (MIT) stehen im [englischen Readme](../../README.md#changelog).

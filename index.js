/*
 * This file is a part of flightgear-star-sid-manager, a tool to extract sid/star data from ARINC 424
 *
 * Copyright (c) 2022-2023 jojo2357
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
const fs = require('fs');
const {parseLine, RouteType, altitudeToXML, Latongitude} = require('./arinc424parser');
const path = require("path");

const oldData = fs.readFileSync("apt.dat").toString().split(/\r?\n/g).filter(it => it.trim().length);

let debugAirports = ["KLAS", "KLAX", "KABQ", "KSNA", "KHOU"];
let debug = false;

let airpourtCode;
let discoveredRunways = {};

for (let i = 2; i < oldData.length; i++) {
    if (oldData[i].match(/^1\s/)) {
        let exploded = oldData[i].match(/^1\s+(-?\d+)\s+\d\s+\d\s+([A-Z]{0,4})\s/);
        if (!exploded) {
            airpourtCode = undefined;
            continue;
        }
        airpourtCode = exploded[2];
        if (debug && !debugAirports.includes(airpourtCode))
            continue;
        discoveredRunways[airpourtCode] = [];
    } else if (!airpourtCode) {
        continue;
    } else if (oldData[i].match(/^100\s/)) {
        if (debug && !debugAirports.includes(airpourtCode))
            continue;
        let exploded = oldData[i].match(/^100\s+\d+(?:\.\d+)?\s+\d+\s+\d+\s+\d+(?:\.\d+)?\s+\d\s+\d\s+\d\s+([0-3]?\d{0,2}[A-Z]?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)(?:\s+\d+\.\d+\s+\d+\.\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([0-3]?\d{0,2}[A-Z]?)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+))?/);
        if (discoveredRunways[airpourtCode].every(rwy => rwy.ident !== exploded[1])) {
            let latnum = Number.parseFloat(exploded[2]);
            let lonnum = Number.parseFloat(exploded[3]);
            discoveredRunways[airpourtCode].push({
                ident: exploded[1],
                lat: new Latongitude(latnum > 0 ? "N" : "S", Math.abs(latnum)),
                lon: new Latongitude(lonnum > 0 ? "E" : "W", Math.abs(lonnum)),
            });
            if (exploded.filter(it => it).length > 4) {
                latnum = Number.parseFloat(exploded[5]);
                lonnum = Number.parseFloat(exploded[6]);
                discoveredRunways[airpourtCode].push({
                    ident: exploded[4],
                    lat: new Latongitude(latnum > 0 ? "N" : "S", Math.abs(latnum)),
                    lon: new Latongitude(lonnum > 0 ? "E" : "W", Math.abs(lonnum)),
                })
            }
        }
    }
}

const data = fs.readFileSync("CIFP_230518/FAACIFP18").toString().split(/\r?\n/g);

/** @type {ParseResult[]} */
const it = data.reduce((out, dater) => {
    let vahl = parseLine(dater); // todo investigate why no location for KAPF
    if (vahl.recognizedLine)
        out.push(vahl);
    else //if (dater.startsWith("SUSAD KAPF"))
    //console.log(dater);
    return out;
}, []);

let movedRunways = {};

const worldDist = 0.00005;
// todo rename this shit
const thingey = it.reduce((out, curr, windex, array) => {
    if (curr.parentident) {
        if (!out[curr.parentident])
            out[curr.parentident] = {};
        if (!out[curr.parentident].runweys)
            out[curr.parentident].runweys = [];
        // todo C is a runway, did you somehow forget that?
        curr.ident.substring(2).replace(/(\d{2})B/, "$1R,$1L").split(",").map(val => val.trim()).forEach(thin => {
            if (!out[curr.parentident].runweys.includes(thin))
                out[curr.parentident].runweys.push(thin);
        });
    }
    if (curr.parentident && discoveredRunways[curr.parentident] && curr.ident.match(/\d{2}([^WG]$|$)/)) {
        if (!movedRunways[curr.parentident]) {
            movedRunways[curr.parentident] = [];
        }
        discoveredRunways[curr.parentident].map(it => Latongitude.distance(it.lat, it.lon, curr.rwylatitude, curr.rwylongitude));

        if (discoveredRunways[curr.parentident].some(other => Latongitude.distance(other.lat, other.lon, curr.rwylatitude, curr.rwylongitude) < worldDist)) {
            if (discoveredRunways[curr.parentident].filter(other => Latongitude.distance(other.lat, other.lon, curr.rwylatitude, curr.rwylongitude) < worldDist).some(thing => thing.ident === curr.ident.substring(2).trim())) {
                // console.log("Close cousin");
            } else {
                // different ident?
                if (discoveredRunways[curr.parentident].filter(other => Latongitude.distance(other.lat, other.lon, curr.rwylatitude, curr.rwylongitude) < worldDist).some(thing => thing.ident.length === curr.ident.trim().length - 2 && ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs((Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4)))) + 4) % 36) - 4 < 4)) {
                    // console.log("I moved");
                    movedRunways[curr.parentident].push({
                        orig: discoveredRunways[curr.parentident].filter(other => Latongitude.distance(other.lat, other.lon, curr.rwylatitude, curr.rwylongitude) < worldDist).find(thing => thing.ident.length === curr.ident.trim().length - 2 && ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs((Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4)))) + 4) % 36) - 4 < 4).ident,
                        neww: curr.ident.substring(2).trim()
                    });
                } else {
                    if (discoveredRunways[curr.parentident].some(thing => ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs(Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4 < 4)) {
                        // console.log("???");
                        movedRunways[curr.parentident].push({
                            orig: discoveredRunways[curr.parentident].filter(thing => ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs(Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4 < 4).sort((a, b) => ((Math.abs(Number.parseInt(a.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4 - ((Math.abs(Number.parseInt(b.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4)[0].ident,
                            neww: curr.ident.substring(2).trim()
                        });
                    } else {
                        console.log("Im missing");
                    }
                }
            }
        } else if (discoveredRunways[curr.parentident].some(thing => ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs(Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4 < 4)) {
            movedRunways[curr.parentident].push({
                orig: discoveredRunways[curr.parentident].find(thing => ((thing.ident.length === 3) ? (thing.ident.charAt(2) === curr.ident.charAt(4)) : true) && ((Math.abs(Number.parseInt(thing.ident.substring(0, 2)) - Number.parseInt(curr.ident.substring(2, 4))) + 4) % 36) - 4 < 4).ident,
                neww: curr.ident.substring(2).trim()
            });
        } else {
            console.log("Unrelated?");
        }
        if (movedRunways[curr.parentident].length && !movedRunways[curr.parentident][movedRunways[curr.parentident].length - 1].neww.match(/^\d{2}\w?$/)) {
            console.log("Thats not a runway!");
        }
        if (movedRunways[curr.parentident].some(thing => movedRunways[curr.parentident].some(other => thing !== other && other.neww === thing.orig))) {
            console.log("I did a bad thing");
        }
    }
    process.stdout.write(`Parsing ${windex}/${array.length}\r`);
    if (curr.airportIDENT && discoveredRunways[curr.airportIDENT]) {
        if (!out[curr.airportIDENT])
            out[curr.airportIDENT] = {};
        if (!out[curr.airportIDENT][curr.SID_STAR_Ident])
            if (curr.is_SID)
                out[curr.airportIDENT][curr.SID_STAR_Ident] = {sid: true};
            else if (curr.is_STAR)
                out[curr.airportIDENT][curr.SID_STAR_Ident] = {star: true};
            else if (curr.is_APPROACH)
                out[curr.airportIDENT][curr.SID_STAR_Ident] = {approach: true};
        if (!out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType])
            out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType] = {};
        if (!out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType][curr.TRANS_IDENT])
            out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType][curr.TRANS_IDENT] = [];
        if (!curr.fix_ident.match(/RW\d{2}/)) {
            out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType][curr.TRANS_IDENT].push({
                loc: it.some(val => val.ident && curr.fix_ident && val.ident.trim() === curr.fix_ident.trim()) ? it.find(val => val.ident && curr.fix_ident && val.ident.trim() === curr.fix_ident.trim()) : curr.fix_ident,
                obj: curr
            });
        } else {
            out[curr.airportIDENT][curr.SID_STAR_Ident][curr.routeType][curr.TRANS_IDENT].push({
                loc: it.some(val => val.ident && val.parentident && curr.fix_ident && val.ident.trim() === curr.fix_ident.trim() && val.parentident.trim() === curr.airportIDENT) ? it.find(val => val.ident && val.parentident && curr.fix_ident && val.ident.trim() === curr.fix_ident.trim() && val.parentident.trim() === curr.airportIDENT) : curr.fix_ident,
                obj: curr
            });
            if (!out[curr.airportIDENT].runweys)
                out[curr.airportIDENT].runweys = [];
            curr.fix_ident.substring(2).replace(/(\d{2})B/, "$1R,$1L").split(",").map(val => val.trim()).forEach(thin => {
                if (!out[curr.airportIDENT].runweys.includes(thin))
                    out[curr.airportIDENT].runweys.push(thin);
            });
        }
    }
    return out;
}, {});

for (const movedRunwaysKey in movedRunways) {
    movedRunways[movedRunwaysKey] = movedRunways[movedRunwaysKey].filter(thing => thing.orig !== thing.neww);
    if (!(movedRunways[movedRunwaysKey].length))
        continue;
    if (movedRunways[movedRunwaysKey].some(thing => movedRunways[movedRunwaysKey].some(other => thing !== other && Math.abs(Number.parseInt(thing.orig.substring(0, 2)) - Number.parseInt(other.orig.substring(0, 2))) <= 1)))
        console.log(movedRunways[movedRunwaysKey]);

    let outstring = `<PropertyList build="By jojo2357, with FAA data. Data factor = ${(it.length / data.length).toFixed(4)}">\n\t<runway-rename>\n${movedRunways[movedRunwaysKey].map(thing => `${"\t".repeat(2)}<runway>\n${"\t".repeat(3)}<old-ident>${thing.orig}</old-ident>\n${"\t".repeat(3)}<new-ident>${thing.neww}</new-ident>\n${"\t".repeat(2)}</runway>`).join('\n')}\n\t</runway-rename>\n</PropertyList>`;

    fs.mkdirSync(path.join(process.cwd(), "2020.4", ...movedRunwaysKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "2020.4", ...movedRunwaysKey.split("").slice(0, -1), `${movedRunwaysKey}.runway_rename.xml`), outstring);
    fs.mkdirSync(path.join(process.cwd(), "Airports", ...movedRunwaysKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "Airports", ...movedRunwaysKey.split("").slice(0, -1), `${movedRunwaysKey}.runway_rename.xml`), outstring);
    fs.mkdirSync(path.join(process.cwd(), "realairports", ...movedRunwaysKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "realairports", ...movedRunwaysKey.split("").slice(0, -1), `${movedRunwaysKey}.runway_rename.xml`), outstring);
}

console.log("Wrote renames");

for (const thingeyKey in thingey) {
    if (Object.keys(thingey[thingeyKey]).length <= 1)
        continue;
    process.stdout.write(`Running on ${thingeyKey}  \r`);
    let oufile = path.join(...thingeyKey.split("").slice(0, -1), `${thingeyKey}.procedures.xml`);
    let future_branch_outstring = `<ProceduresDB build="By jojo2357, with FAA data. Data factor = ${(it.length / data.length).toFixed(4)}">\n\t<Airport ICAOcode="${thingeyKey}">\n`;
    let current_branch_outstring = `<ProceduresDB build="By jojo2357, with FAA data. Data factor = ${(it.length / data.length).toFixed(4)}">\n\t<Airport ICAOcode="${thingeyKey}">\n`;
    let depth = 2;
    let namedRoute = thingey[thingeyKey];
    let sids = 0, stars = 0, approaches = 0;
    let completedsids = 0, completedstars = 0, completedapproaches = 0;
    for (const sidarname in namedRoute) {
        let route = namedRoute[sidarname];
        // todo consolidate this if tree
        if (route.sid) {
            sids++;
            let sidplaced = false;
            try {
                let entrans = [route[RouteType["PD"]["3"]], route[RouteType["PD"]["6"]], route[RouteType["PD"]["S"]], route[RouteType["PD"]["V"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);
                let trans = [route[RouteType["PD"]["1"]], route[RouteType["PD"]["4"]], route[RouteType["PD"]["F"]], route[RouteType["PD"]["T"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);
                let commoners = [route[RouteType["PD"]["2"]], route[RouteType["PD"]["5"]],
                    route[RouteType["PD"]["8"]], route[RouteType["PD"]["M"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);

                sidplaced = true;

                future_branch_outstring += `${'\t'.repeat(depth)}<Sid Name="${sidarname}" Runways="${Object.keys(trans.length ? trans[0] : commoners[0]).map(it => it.trim().replace("ALL", thingey[thingeyKey].runweys.join(",")).replace(/(\d{2})B/, "$1R,$1L")).join(",")}">\n`;
                current_branch_outstring += `${'\t'.repeat(depth++)}<Sid Name="${sidarname}" Runways="${Object.keys(trans.length ? trans[0] : commoners[0]).map(it => it.trim().replace("ALL", thingey[thingeyKey].runweys.join(",")).replace(/(\d{2})B/, "$1R,$1L")).join(",")}">\n`;
                for (const commonerlist of commoners) {
                    for (const simpsKey in commonerlist) {
                        for (const simps of commonerlist[simpsKey]) {
                            future_branch_outstring += wayptToString(simps, "Sid_Waypoint", depth, false);
                            current_branch_outstring += wayptToString(simps, "Sid_Waypoint", depth, true);
                        }
                    }
                }
                for (const translist of entrans) {
                    for (const simpsKey in translist) {
                        future_branch_outstring += `${'\t'.repeat(depth)}<Sid_Transition Name="${simpsKey}">\n`;
                        current_branch_outstring += `${'\t'.repeat(depth++)}<Sid_Transition Name="${simpsKey}">\n`;
                        for (const simps of translist[simpsKey]) {
                            future_branch_outstring += wayptToString(simps, "SidTr_Waypoint", depth, false);
                            current_branch_outstring += wayptToString(simps, "SidTr_Waypoint", depth, true);
                        }
                        future_branch_outstring += `${'\t'.repeat(--depth)}</Sid_Transition>\n`;
                        current_branch_outstring += `${'\t'.repeat(depth)}</Sid_Transition>\n`;
                    }
                }
                for (const translist of trans) {
                    for (const simpsKey in translist) {
                        for (const runwey of simpsKey.match(/(?:RW)?(.*)$/)[1].trim().replace(/(\d{2})B/, "$1R,$1L").split(",")) {
                            future_branch_outstring += `${'\t'.repeat(depth)}<RunwayTransition Runway="${runwey}">\n`;
                            current_branch_outstring += `${'\t'.repeat(depth++)}<RunwayTransition Runway="${runwey}">\n`;
                            for (const simps of translist[simpsKey]) {
                                future_branch_outstring += wayptToString(simps, "RwyTr_Waypoint", depth, false);
                                current_branch_outstring += wayptToString(simps, "RwyTr_Waypoint", depth, true);
                            }
                            future_branch_outstring += `${'\t'.repeat(--depth)}</RunwayTransition>\n`;
                            current_branch_outstring += `${'\t'.repeat(depth)}</RunwayTransition>\n`;
                        }
                    }
                }
                completedsids++;
            } catch (E) {
                console.error(`Something went wrong parsing ${sidarname} for ${thingeyKey}`, E);
            }
            if (sidplaced)
                future_branch_outstring += `${'\t'.repeat(--depth)}</Sid>\n`;
            current_branch_outstring += `${'\t'.repeat(depth)}</Sid>\n`;
        } else if (route.star) {
            stars++;
            /*if (!route[RouteType["PE"]["2"]] && !route[RouteType["PE"]["5"]]
                && !route[RouteType["PE"]["8"]] && !route[RouteType["PE"]["M"]]) {
                continue;
            }*/
            try {
                let trans = [route[RouteType["PE"]["1"]], route[RouteType["PE"]["4"]], route[RouteType["PE"]["7"]], route[RouteType["PE"]["F"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);
                let commoners = [route[RouteType["PE"]["2"]], route[RouteType["PE"]["5"]],
                    route[RouteType["PE"]["8"]], route[RouteType["PE"]["M"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);
                //unused and i dont know how. makes me sadge :(
                let rwyTrans = [route[RouteType["PE"]["3"]], route[RouteType["PE"]["6"]],
                    route[RouteType["PE"]["9"]], route[RouteType["PE"]["S"]]].reduce((out, arr) => {
                    if (arr) out.push(arr);
                    return out;
                }, []);
                if (rwyTrans.length) {
                    for (const rwyTran in rwyTrans[0]) {
                        future_branch_outstring += `${'\t'.repeat(depth)}<Star Name="${sidarname}.${rwyTran.match(/(?:RW)?(.*)$/)[1].trim().slice(0, 2)}" Runways="${rwyTran.match(/(?:RW)?(.*)$/)[1].trim().replace(/(\d{2})B/, "$1R,$1L")}">\n`;
                        current_branch_outstring += `${'\t'.repeat(depth++)}<Star Name="${sidarname}.${rwyTran.match(/(?:RW)?(.*)$/)[1].trim().slice(0, 2)}" Runways="${rwyTran.match(/(?:RW)?(.*)$/)[1].trim().replace(/(\d{2})B/, "$1R,$1L")}">\n`;
                        for (const commonerlist of commoners) {
                            for (const simpsKey in commonerlist) {
                                for (const simps of commonerlist[simpsKey]) {
                                    future_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, false);
                                    current_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, true);
                                }
                            }
                        }
                        for (const simps of rwyTrans[0][rwyTran]) {
                            future_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, false);
                            current_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, true);
                        }
                        for (const translist of trans) {
                            for (const simpsKey in translist) {
                                future_branch_outstring += `${'\t'.repeat(depth)}<Star_Transition Name="${simpsKey}">\n`;
                                current_branch_outstring += `${'\t'.repeat(depth++)}<Star_Transition Name="${simpsKey}">\n`;
                                for (const simps of translist[simpsKey]) {
                                    future_branch_outstring += wayptToString(simps, "StarTr_Waypoint", depth, false);
                                    current_branch_outstring += wayptToString(simps, "StarTr_Waypoint", depth, true);
                                }
                                future_branch_outstring += `${'\t'.repeat(--depth)}</Star_Transition>\n`;
                                current_branch_outstring += `${'\t'.repeat(depth)}</Star_Transition>\n`;
                            }
                        }
                        // console.log(rwyTranKey);
                        future_branch_outstring += `${'\t'.repeat(--depth)}</Star>\n`;
                        current_branch_outstring += `${'\t'.repeat(depth)}</Star>\n`;
                    }
                } else {
                    future_branch_outstring += `${'\t'.repeat(depth)}<Star Name="${sidarname}">\n`;
                    current_branch_outstring += `${'\t'.repeat(depth++)}<Star Name="${sidarname}">\n`;
                    for (const commonerlist of commoners) {
                        for (const simpsKey in commonerlist) {
                            for (const simps of commonerlist[simpsKey]) {
                                future_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, false);
                                current_branch_outstring += wayptToString(simps, "Star_Waypoint", depth, true);
                            }
                        }
                    }
                    for (const translist of trans) {
                        for (const simpsKey in translist) {
                            future_branch_outstring += `${'\t'.repeat(depth)}<Star_Transition Name="${simpsKey}">\n`;
                            current_branch_outstring += `${'\t'.repeat(depth++)}<Star_Transition Name="${simpsKey}">\n`;
                            for (const simps of translist[simpsKey]) {
                                future_branch_outstring += wayptToString(simps, "StarTr_Waypoint", depth, false);
                                current_branch_outstring += wayptToString(simps, "StarTr_Waypoint", depth, true);
                            }
                            future_branch_outstring += `${'\t'.repeat(--depth)}</Star_Transition>\n`;
                            current_branch_outstring += `${'\t'.repeat(depth)}</Star_Transition>\n`;
                        }
                    }
                    future_branch_outstring += `${'\t'.repeat(--depth)}</Star>\n`;
                    current_branch_outstring += `${'\t'.repeat(depth)}</Star>\n`;
                }
                completedstars++;
            } catch (E) {
                console.error(`Something went wrong parsing ${sidarname} for ${thingeyKey}`);
            }
        } else if (route.approach) {
            approaches++;
            // continue;
            let transitions = [route[RouteType["PF"]["A"]]].reduce((out, arr) => {
                if (arr) out.push(arr);
                return out;
            }, []);
            let meatofit = [
                "B", "D", "F", "G", "H", "I", "J", "L", "M", "N", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
            ].map(it => route[RouteType["PF"][it]]).reduce((out, arr) => {
                if (arr) out.push(arr);
                return out;
            }, []);
            let changedName = "";
            switch (sidarname.charAt(0)) {
                case "H":
                    changedName = `RNV${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "I":
                    changedName = `ILS${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "L":
                    changedName = `VDM${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "R":
                    changedName = `RNV${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "V":
                case "S":
                    changedName = `VOR${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "B":
                    changedName = `LBC${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "N":
                    changedName = `NDB${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "Q":
                    changedName = `NDM${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "D":
                    changedName = `TAC${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "X":
                    changedName = `LDA${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "P":
                    changedName = `GPS${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                case "U":
                    changedName = `SDF${sidarname.charAt(4) === " " ? !["R", "L", "C"].includes(sidarname.charAt(3)) ? sidarname.charAt(3) : "" : sidarname.charAt(4)}`;
                    break;
                default:
                    changedName = sidarname;
            }
            changedName += sidarname.slice(1, ["R", "L", "C"].includes(sidarname.charAt(3)) ? 4 : 3);
            changedName = changedName.replace('-', '')
            if (changedName === "")
                continue;
            future_branch_outstring += `${'\t'.repeat(depth)}<Approach Name="${changedName.trim()}">\n`;
            // todo runway swapping sooner
            current_branch_outstring += `${'\t'.repeat(depth++)}<Approach Name="${(changedName.substring(0, 3) + (movedRunways[thingeyKey].some(change => change.neww === changedName.substring(3)) ? movedRunways[thingeyKey].find(change => change.neww === changedName.substring(3)).orig : changedName.substring(3))).trim()}">\n`;
            for (const commonerlist of meatofit) {
                for (const simpsKey in commonerlist) {
                    for (const simps of commonerlist[simpsKey]) {
                        // future_branch_outstring += `${'\t'.repeat(depth)}<App_Waypoint>\n`;
                        // current_branch_outstring += `${'\t'.repeat(depth++)}<App_Waypoint>\n`;

                        future_branch_outstring += wayptToString(simps, "App_Waypoint", depth, false);
                        current_branch_outstring += wayptToString(simps, "App_Waypoint", depth, true);

                        // future_branch_outstring += `${'\t'.repeat(--depth)}</App_Waypoint>\n`;
                        // current_branch_outstring += `${'\t'.repeat(depth)}</App_Waypoint>\n`;
                    }
                }
            }
            for (const translist of transitions) {
                for (const simpsKey in translist) {
                    future_branch_outstring += `${'\t'.repeat(depth)}<App_Transition Name="${simpsKey}">\n`;
                    current_branch_outstring += `${'\t'.repeat(depth++)}<App_Transition Name="${simpsKey}">\n`;
                    for (const simps of translist[simpsKey]) {
                        future_branch_outstring += wayptToString(simps, "AppTr_Waypoint", depth, false);
                        current_branch_outstring += wayptToString(simps, "AppTr_Waypoint", depth, true);
                    }
                    future_branch_outstring += `${'\t'.repeat(--depth)}</App_Transition>\n`;
                    current_branch_outstring += `${'\t'.repeat(depth)}</App_Transition>\n`;
                }
            }
            completedapproaches++;
            future_branch_outstring += `${'\t'.repeat(--depth)}</Approach>\n`;
            current_branch_outstring += `${'\t'.repeat(depth)}</Approach>\n`;
        } else {
            // bad
        }
    }
    future_branch_outstring += `\t</Airport>\n</ProceduresDB>\n<!-- Completion Stats:\nSids: ${completedsids}/${sids}\nStars: ${completedstars}/${stars}\nAppch: ${completedapproaches}/${approaches}\n-->`;
    current_branch_outstring += `\t</Airport>\n</ProceduresDB>\n<!-- Completion Stats:\nSids: ${completedsids}/${sids}\nStars: ${completedstars}/${stars}\nAppch: ${completedapproaches}/${approaches}\n-->`;
    fs.mkdirSync(path.join(process.cwd(), "2020.4", ...thingeyKey.split("").slice(0, -1)), {recursive: true});
    fs.mkdirSync(path.join(process.cwd(), "2020.3", ...thingeyKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "2020.4", ...thingeyKey.split("").slice(0, -1), `${thingeyKey}.procedures.xml`), future_branch_outstring);
    fs.writeFileSync(path.join(process.cwd(), "2020.3", ...thingeyKey.split("").slice(0, -1), `${thingeyKey}.procedures.xml`), current_branch_outstring);
    fs.mkdirSync(path.join(process.cwd(), "Airports", ...thingeyKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "Airports", ...thingeyKey.split("").slice(0, -1), `${thingeyKey}.procedures.xml`), future_branch_outstring);
    fs.mkdirSync(path.join(process.cwd(), "realairports", ...thingeyKey.split("").slice(0, -1)), {recursive: true});
    fs.writeFileSync(path.join(process.cwd(), "realairports", ...thingeyKey.split("").slice(0, -1), `${thingeyKey}.procedures.xml`), future_branch_outstring);
}

//console.log(thing);

console.log();

function getAltitudeRestriction(nav_altitude) {
    let out = "<AltitudeRestriction>";
    switch (nav_altitude) {
        case "B":
        case "G":
        case "H":
        case "V":
            out += `between`;
            break;
        case "+": {
            out += `above`;
            break;
        }
        case "-": {
            out += `below`;
            break;
        }
        case "J":
        case "I":
        case " ": {
            out += `at`;
            break;
        }

        default:
            console.log("Unrecognized nav alt", nav_altitude);
    }
    return out + '</AltitudeRestriction>\n';
}

function getAltitudes(obj, tabs = "") {
    let out = "";

    let dispalt1 = obj.nav_altitude_1;
    dispalt1 = (dispalt1.match(/(FL)?(\d+)/) ? dispalt1.match(/(FL)?(\d+)/)[2] + (dispalt1.match(/(FL)?(\d+)/)[1] ? "00" : "") : "").trim();
    let dispalt2 = obj.nav_altitude_2;
    dispalt2 = (dispalt2.match(/(FL)?(\d+)/) ? dispalt2.match(/(FL)?(\d+)/)[2] + (dispalt2.match(/(FL)?(\d+)/)[1] ? "00" : "") : "").trim();

    if (dispalt1.length === 0) dispalt1 = "0";
    if (dispalt2.length === 0) dispalt2 = "0";

    out += `${tabs}<Altitude>${dispalt1}</Altitude>\n`;
    out += `${tabs}<AltitudeCons>${dispalt2}</AltitudeCons>\n`;

    return out;
}

// todo next waypt to fix some things
// todo use old runway so that 2020.3 actually works
function wayptToString(waypt, tagName, tabDepth = 0, useOldRunway = false, nextWaypt) {
    if (waypt.obj.fix_path_termination === "FM") {
        return specialWaypt(waypt, tagName, tabDepth, useOldRunway);
    }
    let out = `${'\t'.repeat(tabDepth)}<${tagName}>\n`;
    // console.log();
    // name
    const tabs = '\t'.repeat(tabDepth + 1);
    out += `${tabs}<Name>`;
    switch (waypt.obj.fix_path_termination) {
        case "TF":
        case "DF":
        case "RF":
        case "IF":
        case "AF":
        case "FC":
        case "PI":
            out += waypt.obj.fix_ident;
            break;
        case "VA":
        case "FA":
        case "CA":
            out += `(${waypt.obj.nav_altitude_1.length ? waypt.obj.nav_altitude_1 : waypt.obj.nav_altitude_2})`;
            break;
        case "VI":
            out += `(INTC)`; // this might be const hdg to alt with a split with intc
            break;
        case "CF":
            out += waypt.obj.fix_ident; // cousin of above, really the second half therin
            break;
        case "VM":
        case "VD":
            out += "(VECTORS)";
            break;
        case "CD":
            out += waypt.obj.nav_fix;
            break;
        case "VR":
            out += waypt.obj.fix_path_navaid;
            break;
        case "HM":
        case "HF":
        case "HA":
            out += waypt.obj.fix_ident;
            break;
        case "CI":
            break;
        default:
            console.log("Unrecognized:", waypt.obj.fix_path_termination);
    }
    out += `</Name><!-- ${waypt.obj.fix_path_termination} -->\n`;

    // type
    out += `${tabs}<Type>`;
    switch (waypt.obj.fix_path_termination) {
        case "IF":
        case "DF":
        case "RF":
        case "TF":
        case "AF":
        case "FC":
        case "PI":
            out += 'Normal';
            break;
        case "VA":
        case "CA":
        case "FA":
            out += 'ConstHdgtoAlt';
            break;
        case "VI":
            out += 'Intc';
            break;
        case "CF":
            out += 'Normal';
            break;
        case "VM":
        case "VD":
            out += "Vectors";
            break;
        case "CD":
            out += "DmeInc";
            break;
        case "VR":
            out += "VorRadialIntc";
            break;
        case "HM":
        case "HF":
        case "HA":
            out += "Hold";
    }
    out += "</Type>\n";

    // lat/lon
    let latstr = `${tabs}<Latitude>`;
    let lonstr = `${tabs}<Longitude>`;

    switch (waypt.obj.fix_path_termination) {
        case "IF":
        case "DF":
        case "RF":
        case "TF":
        case "AF":
        case "PI":
        case "FC":
        case "HM":
        case "HF":
        case "HA":
            if (waypt.loc.reallatitude) {
                latstr += Latongitude.toAbsNumber(waypt.loc.reallatitude);
                lonstr += Latongitude.toAbsNumber(waypt.loc.reallongtude);
            } else if (waypt.loc.vorLatitude){
                latstr += Latongitude.toAbsNumber(waypt.loc.vorLatitude);
                lonstr += Latongitude.toAbsNumber(waypt.loc.vorLongitude);
            } else if (waypt.loc.DMELatitude){
                latstr += Latongitude.toAbsNumber(waypt.loc.DMELatitude);
                lonstr += Latongitude.toAbsNumber(waypt.loc.DMELongitude);
            } else if (waypt.loc.rwylatitude){
                latstr += Latongitude.toAbsNumber(waypt.loc.rwylatitude);
                lonstr += Latongitude.toAbsNumber(waypt.loc.rwylongitude);
            } else {
                console.log("FUUUUUCK", waypt.loc);
            }
            break;
        case "VR":
        case "CD":
        case "VD":
        case "CF": // see above comments
            {
            let loc = it.find(thing => thing.ident && thing.ident.trim() === waypt.obj.fix_path_navaid.trim());

            if (loc.vorLatitude){
                latstr += Latongitude.toAbsNumber(loc.vorLatitude);
                lonstr += Latongitude.toAbsNumber(loc.vorLongitude);
            } else if (loc.DMELatitude){
                latstr += Latongitude.toAbsNumber(loc.DMELatitude);
                lonstr += Latongitude.toAbsNumber(loc.DMELongitude);
            } else if (loc.reallatitude) {
                latstr += Latongitude.toAbsNumber(loc.reallatitude);
                lonstr += Latongitude.toAbsNumber(loc.reallongtude);
            } else {
                console.log("FUUUUUCK", loc);
            }
            break;
        }
        case "FA":
        case "VA":
        case "CA":
            latstr += "0";
            lonstr += "0";
            break;
        case "VI":
        case "VM":
            // todo should be coords of waypt referred to;
            latstr += "0";
            lonstr += "0";
            break;
        default:
            console.log("Fuck", waypt.obj.fix_path_termination);
    }

    out += `${latstr}</Latitude>\n${lonstr}</Longitude>\n`;

    if (waypt.obj.fix_description.charAt(1) === "Y") {
        out += `${tabs}<Flytype>Fly-over</Flytype>\n`;
    } else {
        out += `${tabs}<Flytype>Fly-by</Flytype>\n`;
    }

    // Speed
    // if (waypt.obj.nav_speed_limit.trim().length)
    //     out += `${tabs}<Speed>${waypt.obj.nav_speed_limit.trim()}</Speed>\n`;

    // Altitude
    out += getAltitudes(waypt.obj, tabs);

    // Altitude Restriction
    out += tabs + getAltitudeRestriction(waypt.obj.nav_altitude);

    // Speed
    if (waypt.obj.nav_speed_limit.trim().length === 0)
        out += `${tabs}<Speed>0</Speed>\n`;
    else
        out += `${tabs}<Speed>${waypt.obj.nav_speed_limit.trim()}</Speed>\n`;

    // Hdg
    if (waypt.obj.fix_path_termination === "VA" || waypt.obj.fix_path_termination === "FA" || waypt.obj.fix_path_termination === "VI" || waypt.obj.fix_path_termination === "VM" || waypt.obj.fix_path_termination === "VD") {
        out += `${tabs}<Hdg_Crs>1</Hdg_Crs>\n`;
        out += `${tabs}<Hdg_Crs_value>${Number.parseInt(waypt.obj.fix_magnetic_course) * (waypt.obj.fix_magnetic_course.endsWith("T") ? 1 : 0.1)}</Hdg_Crs_value>\n`
    } else if (waypt.obj.fix_path_termination === "CA") {
        out += `${tabs}<Hdg_Crs>0</Hdg_Crs>\n`;
        out += `${tabs}<Hdg_Crs_value>${Number.parseInt(waypt.obj.fix_magnetic_course) * (waypt.obj.fix_magnetic_course.endsWith("T") ? 1 : 0.1)}</Hdg_Crs_value>\n`
    } else if (waypt.obj.fix_path_termination === "HM" || waypt.obj.fix_path_termination === "HF" || waypt.obj.fix_path_termination === "HA") {
        out += `${tabs}<Hld_Rad_value>${Number.parseInt(waypt.obj.fix_magnetic_course) * (waypt.obj.fix_magnetic_course.endsWith("T") ? 1 : 0.1)}</Hld_Rad_value>\n`;
        out += `${tabs}<Hld_Time_or_Dist>${waypt.obj.fix_distance.startsWith("T") ? "Time" : "Dist"}</Hld_Time_or_Dist>\n`;
        out += `${tabs}<Hld_td_value>${waypt.obj.fix_distance.match(/\d+/) * 0.1}</Hld_td_value>\n`;
        out += `${tabs}<Hld_Rad_or_Inbd>Inbd</Hld_Rad_or_Inbd>\n`;
    } else if (waypt.obj.fix_path_termination === "VR") {
        // console.log();
        out += `${tabs}<Hdg_Crs>1</Hdg_Crs>\n`;
        out += `${tabs}<Hdg_Crs_value>${Number.parseInt(waypt.obj.fix_magnetic_course) * (waypt.obj.fix_magnetic_course.endsWith("T") ? 1 : 0.1)}</Hdg_Crs_value>\n`
        out += `${tabs}<RadialtoIntercept>${Number.parseInt(waypt.obj.fix_theta) * 0.1}</RadialtoIntercept>\n`
        // RadialtoIntercept
    }
    // else if (waypt.obj.fix_magnetic_course.trim().length > 0)
    //     console.log("AAAAAA");

    // turn dir
    if (waypt.obj.fix_path_termination === "HA" || waypt.obj.fix_path_termination === "HM" || waypt.obj.fix_path_termination === "HF") {
        out += `${tabs}<Hld_Turn>${waypt.obj.fix_turn_direction.trim().length === 0 ? "Auto" : waypt.obj.fix_turn_direction === "R" ? "Right" : "Left"}</Hld_Turn>\n`;
    } else
        out += `${tabs}<Sp_Turn>${waypt.obj.fix_turn_direction.trim().length === 0 ? "Auto" : waypt.obj.fix_turn_direction === "R" ? "Right" : "Left"}</Sp_Turn>\n`;

    return out + `${'\t'.repeat(tabDepth)}</${tagName}>\n`;
}

function specialWaypt(waypt, tagName, tabDepth, useOldRunway, nextWaypt) {
    const tabs = '\t'.repeat(tabDepth + 1);

    let out = `${'\t'.repeat(tabDepth)}<${tagName}>\n`;

    out += `${tabs}<Name>${waypt.obj.fix_ident}</Name>\n`;
    out += `${tabs}<Type>Normal</Type>\n`;

    let latstr = `${tabs}<Latitude>`;
    let lonstr = `${tabs}<Longitude>`;

    latstr += Latongitude.toAbsNumber(waypt.loc.reallatitude);
    lonstr += Latongitude.toAbsNumber(waypt.loc.reallongtude);

    out += `${latstr}</Latitude>\n${lonstr}</Longitude>\n`;

    if (waypt.obj.nav_speed_limit.trim().length)
        out += `${tabs}<Speed>${waypt.obj.nav_speed_limit.trim()}</Speed>\n`;
    else
        out += `${tabs}<Speed>0</Speed>\n`;

    out += getAltitudes(waypt.obj, tabs);
    out += tabs + getAltitudeRestriction(waypt.obj.nav_altitude);

    out += `${'\t'.repeat(tabDepth)}</${tagName}>\n`;
    out += `${'\t'.repeat(tabDepth)}<${tagName}>\n`;

    out += `${tabs}<Name>(VECTORS)</Name>\n`;
    out += `${tabs}<Type>Vectors</Type>\n`;

    out += `${tabs}<Latitude>0</Latitude>\n${tabs}<Longitude>0</Longitude>\n`;

    out += `${tabs}<Hdg_Crs>0</Hdg_Crs>\n`;
    out += `${tabs}<Hdg_Crs_value>${Number.parseInt(waypt.obj.fix_magnetic_course) * (waypt.obj.fix_magnetic_course.endsWith("T") ? 1 : 0.1)}</Hdg_Crs_value>\n`

    out += `${'\t'.repeat(tabDepth)}</${tagName}>\n`;

    return out;
}
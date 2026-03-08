import * as nbs from "https://esm.run/@nbsjs/core";
import * as yaml from "https://esm.run/js-yaml";

document.getElementById("convert-btn").addEventListener("click", convertButtonClicked);
document.getElementById("copy-btn").addEventListener("click", copyButtonClicked);

function debugLog(message) {
    //console.log("DEBUG: " + message);
}

const keyToPitchArray = [
  0.5,
  0.53,
  0.56,
  0.6,
  0.63,
  0.67,
  0.7,
  0.76,
  0.8,
  0.84,
  0.9,
  0.94,
  1.0,
  1.06,
  1.12,
  1.18,
  1.26,
  1.34,
  1.42,
  1.5,
  1.6,
  1.68,
  1.78,
  1.88,
  2.0
];

const soundFileToPlaysound = {
    "harp.ogg": "block.note_block.harp",
    "dbass.ogg": "block.note_block.bass",
    "bdrum.ogg": "block.note_block.basedrum",
    "sdrum.ogg": "block.note_block.snare",
    "click.ogg": "block.note_block.hat",
    "guitar.ogg": "block.note_block.guitar",
    "flute.ogg": "block.note_block.flute",
    "bell.ogg": "block.note_block.bell",
    "icechime.ogg": "block.note_block.chime",
    "xylobone.ogg": "block.note_block.xylophone",
    "iron_xylophone.ogg": "block.note_block.iron_xylophone",
    "cow_bell.ogg": "block.note_block.cow_bell",
    "didgeridoo.ogg": "block.note_block.didgeridoo",
    "bit.ogg": "block.note_block.bit",
    "banjo.ogg": "block.note_block.banjo",
    "pling.ogg": "block.note_block.pling"
};


async function convertButtonClicked() {
    debugLog("Convert button clicked");
    outputResult("")
    //get file
    let rawFile = document.getElementById("file-input").files[0];
    debugLog("array buffer");
    setState("reading file");
    const buf = await rawFile.arrayBuffer();
    const song = nbs.fromArrayBuffer(buf);
    debugLog("buffer done");

    debugLog("createInstrumentData");
    setState("reading instrument data");
    const instrumentsData = createInstrumentData(song.instruments.all);

    debugLog("getAudibleNotes");
    setState("reading notes");
    const audibleNotes = getAudibleNotes(song);

    debugLog("dataStructure");
    setState("creating note fonts");
    const songData = dataStructure(audibleNotes, song, instrumentsData);

    debugLog("toConfigYML");
    setState("converting to yml")
    const out = toConfigYML(songData, song);

    debugLog("upLoadToHasteBin");
    setState("uploading to trancarts");
    const link = await upLoadToHasteBin(out);
    setState("        done");

    debugLog("outputResult");
    outputResult("/train chest import " + link)
}

async function upLoadToHasteBin(body) {
    let res = await fetch("https://paste.traincarts.net/documents", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body
    });
    let data = await res.json();
    return "https://paste.traincarts.net/" + data.key
}

function copyButtonClicked() {
    document.getElementById("output").select();
    document.execCommand("copy");
}

function outputResult(text) {
    document.getElementById("output").value = text;
}

function setState(text) {
    document.getElementById("state").textContent = "          " + text;
}

function toConfigYML(songData, song) {

    //SOUND ATTTACHMENT
    const soundAttachments = [];
    for (const key of Object.keys(songData)) {
        soundAttachments.push({
            type: "SOUND",
            sound: {
                key: key
            },
            names: [key]
        });
    }

    //SEQ ATTACHMENT
    const seqTimeConfig = {
        timeSignature: `${song.timeSignature}/4`,
        bpm: song.getTempo() * 60,
        pitchClasses: 12
    }
    const seqEffects = [];
    for (const [key, data] of Object.entries(songData)) {
        for (const [key2, data2] of Object.entries(data)) {
            const seqEffectBase = {
                type: "MIDI",
                effect: key,
                config: {
                    ...seqTimeConfig,
                    notes: data2.map(a => `t=${a.time.toFixed(2)} s=${a.pitch}`)
                },
                volume: {
                    type: "CONSTANT",
                    output: +key2
                }
            }
            seqEffects.push(seqEffectBase)
        }
    }

    const seqAttachment = {
        type: "SEQUENCER",
        start: {
            duration: song.getDuration() / 1000,
            effects: seqEffects
        }
    }

    const allAttachment = Object.assign({},[seqAttachment, ...soundAttachments]);
    //BASE
    const attachBase = {
        carts: {
            0: {
            model: {
                type: "ENTITY",
                entityType: "MINECART",
                attachments: allAttachment,
                editor: {
                selectedIndex: 0
                }
            },
            entityType: "MINECART",
            flipped: false
            }
        }
    }

    return yaml.dump(attachBase);
}


function getAudibleNotes(song) {

    //main filter
    const hasSoloLayer = song.layers.all.some(layer => layer.isSolo);
    const audibleLayers = song.layers.all.filter(layer =>
        !layer.isLocked &&
        layer.volume > 0 &&
        layer.notes.getTicks.length !== 0 &&
        (!hasSoloLayer || layer.isSolo)
    );

    //get max length tick
    let maxTick = 0;
    for (const layer of audibleLayers) {
        const ticks = layer.notes.getTicks;
        const lastTick = ticks[ticks.length - 1];
        if (lastTick > maxTick) maxTick = lastTick;
    }
    maxTick++;

    //foreach notes
    const out = []
    for (const layer of audibleLayers) {
        const notes = layer.notes;
        //for each note in layers
        notes.getTicks.forEach(tick => {
            const note = notes.all["" + tick];
            //make key object for pallet
            const noteObj = {
                key: note.key,
                instrument: note.instrument,
                volume: layer.volume,
                tick: tick
            }
            out.push(noteObj)
        })
    }
    return out;
}

function dataStructure(notes, song, insm) {
    const tempo = song.getTempo();
    const data = {}
    notes.sort((a, b) => a.tick - b.tick)
    for (const note of notes) {
        //get notedata
        const {key, instrument, volume, tick} = note;
        //push
        ((data["" + insm[instrument]] ??= {})["" + (volume / 100)] ??= []).push({
            time: tick / tempo,
            pitch: keyToPitchArray[key - 33]
        });
    }
    return data;
}

function createInstrumentData(instruments) {
    const out = [];
    for (const instrument of Object.values(instruments)) {
        let playsound;
        if (instrument.isBuiltIn) {
            playsound = soundFileToPlaysound[instrument.soundFile]
        } else {
            playsound = instrument.name
        }
        out.push(playsound);
    }
    return out;
}

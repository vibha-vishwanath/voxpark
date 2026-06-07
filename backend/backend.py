from flask import Flask, request, jsonify,stream_with_context,Response
from flask_cors import CORS
from prisma import Prisma
import bcrypt
import pickle
import parselmouth
from parselmouth.praat import call
import numpy as np
import tempfile
import os
from dotenv import load_dotenv
import opensmile

import soundfile as sf
from scipy.signal import find_peaks
from scipy.stats import variation 
from groq import Groq
import assemblyai as aai
import json

load_dotenv()
app = Flask(__name__)

CORS(app, origins="*")
aai.settings.api_key = os.environ.get("ASSEMBLYAI_API_KEY", "")
config = aai.TranscriptionConfig(
    speech_models=["universal-3-pro", "universal-2"],
    language_detection=True,
    speaker_labels=True,
)
aai.settings.base_url = "https://api.assemblyai.com"
prisma = Prisma()
prisma.connect()
client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))


#signin (that should work as signup as well)
#each 1 route for every model (5-models and 1 more for DDK)
#final_output
#analytics 
@app.route("/signin", methods=["POST"])
def signin():
    data = request.get_json()

    try:
        response = prisma.user.find_unique(
            where={"email": data["email"]}
        )
        if response:
            #signin — check password
            is_correct = bcrypt.checkpw(
                data['password'].encode('utf-8'), 
                response.password.encode('utf-8')
            )
            if is_correct:
                # Ensure a Report row exists for this user (handles old accounts)
                prisma.report.upsert(
                    where={"userId": response.id},
                    data={
                        "create": {"userId": response.id},
                        "update": {}
                    }
                )
                return jsonify({
                    "id": response.id,
                    "name": response.name,
                    "age": response.age,
                    "gender": response.gender,
                    "msg": "You have successfully signed in"
                }), 200  
            else:
                return jsonify({
                    "msg": "Password is incorrect"
                }), 401  
        else:
            #signup — create user + report
            hashed_password = bcrypt.hashpw(
                data['password'].encode('utf-8'), 
                bcrypt.gensalt()
            ).decode('utf-8')  
            user_response = prisma.user.create(
                data={
                    "email": data['email'],
                    "password": hashed_password
                }
            )
            prisma.report.create(
                data={
                    "userId":user_response.id
                }
            )
            return jsonify({
                "id": user_response.id, 
                "msg": "User creation success"
            }), 201
    except Exception as e:
        print(f"Signin error: {e}")
        return jsonify({
            "msg": "Something is up with the server"
        }), 500  

@app.route("/update_profile", methods=["POST"])
def update_profile():
    data = request.get_json()
    if not data:
        return jsonify({"msg": "No JSON body provided"}), 400

    user_id = data.get("user_id")
    if not user_id:
        return jsonify({"msg": "user_id is required"}), 400

    # Only include fields that were actually sent
    update_data = {}
    if data.get("name") is not None:
        update_data["name"] = data["name"]
    if data.get("age") is not None:
        update_data["age"] = str(data["age"])
    if data.get("sex") is not None:
        update_data["gender"] = str(data["sex"])

    if not update_data:
        return jsonify({"msg": "No valid fields to update"}), 400

    try:
        prisma.user.update(
            where={"id": user_id},
            data=update_data
        )
        return jsonify({"msg": "Profile updated successfully"}), 200
    except Exception as e:
        print(f"Error updating profile for user {user_id}: {e}")
        return jsonify({"msg": f"Failed to update profile: {str(e)}"}), 500

def extract_voice_features(audio_path):
    sound = parselmouth.Sound(audio_path)

    # ── Pitch & PointProcess (needed for jitter/shimmer) ──────────────────
    pitch = call(sound, "To Pitch", 0.0, 75, 600)         # time_step, f0_min, f0_max
    point_process = call(sound, "To PointProcess (periodic, cc)", 75, 600)

    # ── JITTER ─────────────────────────────────────────────────────────────
    jitter        = call(point_process, "Get jitter (local)",          0, 0, 0.0001, 0.02, 1.3)
    jitter_rap    = call(point_process, "Get jitter (rap)",            0, 0, 0.0001, 0.02, 1.3)
    jitter_ppq5   = call(point_process, "Get jitter (ppq5)",           0, 0, 0.0001, 0.02, 1.3)

    # ── SHIMMER ────────────────────────────────────────────────────────────
    shimmer       = call([sound, point_process], "Get shimmer (local)",    0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq5  = call([sound, point_process], "Get shimmer (apq5)",     0, 0, 0.0001, 0.02, 1.3, 1.6)
    shimmer_apq11 = call([sound, point_process], "Get shimmer (apq11)",    0, 0, 0.0001, 0.02, 1.3, 1.6)

    # ── HNR & NHR ──────────────────────────────────────────────────────────
    harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
    hnr = call(harmonicity, "Get mean", 0, 0)
    nhr = 1 / (10 ** (hnr / 10)) if hnr > 0 else float('nan')  # convert from dB

    return {
        "jitter":        jitter,
        "jitter_rap":    jitter_rap,
        "jitter_ppq5":   jitter_ppq5,
        "shimmer":       shimmer,
        "shimmer_apq5":  shimmer_apq5,
        "shimmer_apq11": shimmer_apq11,
        "hnr":           hnr,
        "nhr":           nhr,
    }

# age,sex,jitter ,jitter:rap, jitter:ppq5, shimmer, shimmer_apq5, shimmer_apq11, hnr,nhr
telemonitoring_severity_model=pickle.load(open("./models/telemonitoring_severity_scores/model.pkl",'rb'))
telemonitoring_severity_scaler=pickle.load(open("./models/telemonitoring_severity_scores/scaler.pkl",'rb'))
telemonitoring_severity_transformer=pickle.load(open("./models/telemonitoring_severity_scores/transformer.pkl",'rb'))

@app.route("/telemonitoring_regression", methods=["POST"])# data  would send age and sex
def telemonitoring_regression():
    user_id = request.form.get('user_id')
    age = request.form.get("age")
    sex = request.form.get("sex") 
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    sound = extract_voice_features(tmp_path)
    os.unlink(tmp_path) 
    
    # Explicit feature mapping to fix HNR/NHR ordering swaps
    features = [
        age,
        sex,
        sound["jitter"],
        sound["jitter_rap"],
        sound["jitter_ppq5"],
        sound["shimmer"],
        sound["shimmer_apq5"],
        sound["shimmer_apq11"],
        sound["nhr"],
        sound["hnr"]
    ]
    output=telemonitoring_severity_transformer.transform([features])
    output=telemonitoring_severity_scaler.transform(output)
    prediction = telemonitoring_severity_model.predict(output)
    if user_id:
        prisma.report.update(
            where={
                "userId":user_id
            },
            data={
                "telemonitoring_regression":str(prediction.tolist())
            }
        )
    return jsonify({"prediction": prediction.tolist()})

#jitter ,jitter:rap, jitter:ppq5, shimmer, shimmer_apq5, shimmer_apq11, hnr,nhr
oxford_parkinsons_model=pickle.load(open("./models/oxford_parkinsons/model.pkl",'rb'))

@app.route("/telemonitoring_classification", methods=["POST"])
def telemonitoring_classification():
    user_id = request.form.get('user_id')
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    sound = extract_voice_features(tmp_path)
    os.unlink(tmp_path) 
    
    # Explicit feature mapping to fix HNR/NHR ordering swaps
    features = [
        sound["jitter"],
        sound["jitter_rap"],
        sound["jitter_ppq5"],
        sound["shimmer"],
        sound["shimmer_apq5"],
        sound["shimmer_apq11"],
        sound["nhr"],
        sound["hnr"]
    ]
    prediction = oxford_parkinsons_model.predict([features])
    if user_id:
        prisma.report.update(
            where={"userId": user_id},
            data={"telemonitoring_classification": str(prediction.tolist())}
        )
    return jsonify({"prediction": prediction.tolist()})

#sex,jitter ,jitter:rap, jitter:ppq5, shimmer, shimmer_apq5, shimmer_apq11, hnr
acoustic_vowel_model=pickle.load(open("./models/acoustic_vowel/model.pkl",'rb'))
acoustic_vowel_scaler=pickle.load(open("./models/acoustic_vowel/scaler.pkl",'rb'))
@app.route("/acoustic_vowel", methods=["POST"])# data  would send sex
def acoustic_vowel():
    user_id = request.form.get('user_id')
    sex = request.form.get("sex")
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    sound = extract_voice_features(tmp_path)
    os.unlink(tmp_path) 
    
    # Explicit feature mapping to fix HNR/NHR ordering swaps
    features = [
        sex,
        sound["jitter"],
        sound["jitter_rap"],
        sound["jitter_ppq5"],
        sound["shimmer"],
        sound["shimmer_apq5"],
        sound["shimmer_apq11"],
        sound["hnr"]
    ]
    output=acoustic_vowel_scaler.transform([features])
    prediction = acoustic_vowel_model.predict(output)
    if user_id:
        prisma.report.update(
            where={"userId": user_id},
            data={"acoustic_vowel": str(prediction.tolist())}
        )
    return jsonify({"prediction": prediction.tolist()})

#reading passage
#readText
smile = opensmile.Smile(
    feature_set=opensmile.FeatureSet.eGeMAPSv02,
    feature_level=opensmile.FeatureLevel.Functionals,
)
readText_model=pickle.load(open("./models/readText/model_readText.pkl",'rb'))
selector_readText=pickle.load(open("./models/readText/selector.pkl",'rb'))
@app.route("/readText", methods=["POST"])
def readText():
    user_id = request.form.get('user_id')
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    features = smile.process_file(tmp_path)
    os.unlink(tmp_path) 
    features=selector_readText.transform(features)
    prediction = readText_model.predict(features)
    if user_id:
        prisma.report.update(
            where={"userId": user_id},
            data={"readText": str(prediction.tolist())}
        )
    return jsonify({"prediction": prediction.tolist()})
#spon dia
spontaneousDialogue_model=pickle.load(open("./models/spontaneousDialogue/model_SponDia.pkl",'rb'))
selector_sponDia=pickle.load(open("./models/readText/selector.pkl",'rb'))
@app.route("/spontaneousDialogue", methods=["POST"])
def spontaneousDialogue():
    user_id = request.form.get('user_id')
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    features = smile.process_file(tmp_path)
    os.unlink(tmp_path) 
    features=selector_sponDia.transform(features)
    prediction = spontaneousDialogue_model.predict(features)
    if user_id:
        prisma.report.update(
            where={"userId": user_id},
            data={"spontaneousDialogue": str(prediction.tolist())}
        )
    return jsonify({"prediction": prediction.tolist()})


#DDK
def load_audio(file_path):
    y, sr = sf.read(file_path)
    if len(y.shape) > 1:
        y = np.mean(y, axis=1) # mixdown to mono
    return y, sr

def extract_ddk_features(y, sr, file_path):
    features = {}

    # --- 1. DDK Rate (syllables/sec via energy bursts) ---
    frame_length = int(0.025 * sr)
    hop_length = int(0.010 * sr)
    
    num_frames = 1 + (len(y) - frame_length) // hop_length
    if num_frames > 0:
        rms = np.array([np.sqrt(np.mean(y[i*hop_length : i*hop_length+frame_length]**2) + 1e-9) for i in range(num_frames)])
    else:
        rms = np.array([0.0])
        
    rms_norm = rms / (np.max(rms) + 1e-9)
    threshold = 0.2
    peaks, _ = find_peaks(rms_norm, height=threshold, distance=int(0.08 * sr / hop_length))
    duration = len(y) / sr if sr > 0 else 1.0
    ddk_rate = len(peaks) / duration
    features['ddk_rate'] = ddk_rate

    # --- 2. DDK Rhythm Irregularity (IPI - inter-peak interval) ---
    if len(peaks) > 1:
        peak_times = peaks * hop_length / sr
        ipi = np.diff(peak_times)
        features['ipi_mean'] = np.mean(ipi)
        features['ipi_std'] = np.std(ipi)
        features['ipi_cv'] = variation(ipi) if np.mean(ipi) > 0 else 0
    else:
        features['ipi_mean'] = 0
        features['ipi_std'] = 0
        features['ipi_cv'] = 0

    # --- 3. Pitch, Jitter, Shimmer, HNR using Parselmouth ---
    try:
        sound = parselmouth.Sound(file_path)
        pitch = call(sound, "To Pitch", 0.0, 50, 300)
        point_process = call(sound, "To PointProcess (periodic, cc)", 50, 300)
        
        # We need these specifically for rule_based_score
        features['jitter'] = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        features['shimmer'] = call([sound, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        
        harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
        features['hnr'] = call(harmonicity, "Get mean", 0, 0)
    except Exception as e:
        print(f"Parselmouth error: {e}")
        features['jitter'] = 0
        features['shimmer'] = 0
        features['hnr'] = 0

    features['f0_mean'] = 0

    # --- 4. ZCR std manually using numpy ---
    hop = int(0.010 * sr)
    if len(y) > hop:
        frame_zcr = [np.mean(np.abs(np.diff(np.sign(y[i:i+hop])))) / 2 for i in range(0, len(y)-hop, hop)]
        features['zcr_std'] = np.std(frame_zcr)
    else:
        features['zcr_std'] = 0

    return features, peaks, duration

def rule_based_score(features):
    score = 0
    flags = []

    # DDK Rate: normal ~5–7 syllables/sec for /pa-ta-ka/
    rate = features['ddk_rate']
    if rate < 3.5:
        score += 2
        flags.append(f"DDK rate very low ({rate:.2f}/sec) — reduced motor speed")
    elif rate < 4.5:
        score += 1
        flags.append(f"DDK rate slightly low ({rate:.2f}/sec)")
    elif rate > 8.5:
        score += 1
        flags.append(f"DDK rate high ({rate:.2f}/sec) — possible festination")

    # IPI CV: coefficient of variation — high = irregular rhythm
    ipi_cv = features['ipi_cv']
    if ipi_cv > 0.30:
        score += 2
        flags.append(f"High rhythm irregularity (IPI CV={ipi_cv:.3f}) — arrhythmic DDK")
    elif ipi_cv > 0.18:
        score += 1
        flags.append(f"Moderate rhythm irregularity (IPI CV={ipi_cv:.3f})")

    # Jitter: normal < 0.01 (1%)
    jitter = features['jitter']
    if jitter > 0.04:
        score += 2
        flags.append(f"High jitter ({jitter:.4f}) — pitch instability")
    elif jitter > 0.02:
        score += 1
        flags.append(f"Elevated jitter ({jitter:.4f})")

    # Shimmer: normal < 0.15
    shimmer = features['shimmer']
    if shimmer > 0.35:
        score += 2
        flags.append(f"High shimmer ({shimmer:.4f}) — amplitude instability")
    elif shimmer > 0.20:
        score += 1
        flags.append(f"Elevated shimmer ({shimmer:.4f})")

    # HNR: lower = more noise in voice
    hnr = features['hnr']
    if hnr < 5:
        score += 2
        flags.append(f"Low HNR ({hnr:.2f} dB) — breathy/noisy voice")
    elif hnr < 10:
        score += 1
        flags.append(f"Reduced HNR ({hnr:.2f} dB)")

    # ZCR std: high variation may indicate voice breaks
    zcr_std = features['zcr_std']
    if zcr_std > 0.12:
        score += 1
        flags.append(f"High ZCR variability ({zcr_std:.4f}) — voice instability")

    return score, flags

def classify_parkinsons(score, flags):
    print("\n" + "="*55)
    print("       DDK VOICE ANALYSIS — PARKINSON'S SCREENING")
    print("="*55)

    if score >= 7:
        result = "HIGH RISK — Likely Parkinson's indicators present"
        verdict = "POSITIVE (High Confidence)"
        advice = "Strong acoustic markers consistent with PD. Urgent clinical evaluation recommended."
    elif score >= 4:
        result = "MODERATE RISK — Some Parkinson's indicators detected"
        verdict = "POSSIBLE (Moderate Confidence)"
        advice = "Multiple mild markers found. Clinical assessment strongly advised."
    elif score >= 2:
        result = "LOW RISK — Mild anomalies detected"
        verdict = "UNLIKELY (Low-Moderate Confidence)"
        advice = "Minor deviations from normal. Monitoring or follow-up may be warranted."
    else:
        result = "NORMAL — No significant Parkinson's indicators"
        verdict = "NEGATIVE"
        advice = "Voice DDK features are within expected normal range."



    return verdict

def analyze_ddk(file_path):
    y, sr = load_audio(file_path)
    features, peaks, duration = extract_ddk_features(y, sr, file_path)

    print(f"\n--- Raw Feature Summary ---")
    print(f"  DDK Rate       : {features['ddk_rate']:.2f} syllables/sec  (detected {len(peaks)} bursts)")
    print(f"  IPI Mean       : {features['ipi_mean']*1000:.1f} ms")
    print(f"  IPI CV         : {features['ipi_cv']:.4f}")
    print(f"  F0 Mean        : {features['f0_mean']:.2f} Hz")
    print(f"  Jitter         : {features['jitter']:.4f}")
    print(f"  Shimmer        : {features['shimmer']:.4f}")
    print(f"  HNR            : {features['hnr']:.2f} dB")
    print(f"  ZCR Std        : {features['zcr_std']:.4f}")

    score, flags = rule_based_score(features)
    verdict = classify_parkinsons(score, flags)
    return features, score, verdict

@app.route("/ddk", methods=["POST"])
def ddk():
    user_id = request.form.get('user_id')
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    features, score, verdict = analyze_ddk(tmp_path)
    features = {
    k: float(v) if isinstance(v, (np.floating, np.float32, np.float64))
    else int(v) if isinstance(v, (np.integer,))
    else v
    for k, v in features.items()
    }
    os.unlink(tmp_path)
    if user_id:
        prisma.report.update(
            where={"userId": user_id},
            data={"ddk": json.dumps({"features": features, "score": score, "verdict": verdict})}
        )
    return jsonify({"features":features,"score":score,"verdict":verdict })
def sysIns(transcript,text):
    systemInstructions=f"""
    You a analyzer for a natural speech. You should comapare the transcript of user to the original text.
    Give a short analysis exactly 50 words in string , no markdown. Return just the analysis.

    Transcript:{transcript}
    
    Original Text:{text}
    """
    return systemInstructions

@app.route("/natural_speech",methods=['POST'])
def natural_speech():
    user_id = request.form.get('user_id')
    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()
    original_text=request.form.get("original_text") 
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    transcript = aai.Transcriber().transcribe(tmp_path, config=config)
    os.unlink(tmp_path) 
    completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
      {
        "role": "system",
        "content":sysIns(transcript.text,original_text)
      }
    ],
    temperature=1,
    max_completion_tokens=100,
    top_p=1,
    stream=True,
    stop=None
    )
    collected_text = []
    def generate():
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            collected_text.append(content)
            yield content
        # Save the complete analysis to DB after streaming is done
        if user_id:
            full_text = "".join(collected_text)
            prisma.report.update(
                where={"userId": user_id},
                data={"naturalSpeech": full_text}
            )

    return Response(stream_with_context(generate()), mimetype="text/plain")

#readText
@app.route("/text_generation",methods=['GET'])
def text_generation():
    completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
      {
        "role": "system",
        "content":"You should output a paragraph on a random topic for 100 words. No markdown , only string."
      }
    ],
    temperature=1,
    max_completion_tokens=400,
    top_p=1,
    stream=True,
    stop=None
    )
    def generate():
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            yield content

    return Response(stream_with_context(generate()), mimetype="text/plain")

#sponDia
@app.route("/spon_dia",methods=['GET'])
def spon_dia():
    completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
      {
        "role": "system",
        "content":"""
        You are a dialogue writer specialising in natural spoken English phone conversations. 
        When expanding a conversation, keep the same topic and speakers' roles but make each speaker talk much more — 
        add backchannels, hesitations, clarifications, self-corrections, and organic filler words 
        (um, uh, yeah, right, I mean, sort of, you know, actually, like, kind of, okay, so).
        Each turn should be 1–4 sentences of natural speech. Never sound scripted.
        The output should be like this:-
        {
            "speaker1":"",
            "speaker2":"",
            ..12 instances
        }
        No markdown. 
        """
      }
    ],
    temperature=1,
    max_completion_tokens=800,
    top_p=1,
    stream=True,
    stop=None
    )
    def generate():
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            yield content

    return Response(stream_with_context(generate()), mimetype="text/plain")
#natualSpeech
# paragraph generator
@app.route("/natural_speech_para",methods=['GET'])
def natural_speech_para():
    completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
      {
        "role": "system",
        "content":"You should output a paragraph on a random topic for 150 words. No markdown , only string."
      }
    ],
    temperature=1,
    max_completion_tokens=400,
    top_p=1,
    stream=True,
    stop=None
    )
    def generate():
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            yield content

    return Response(stream_with_context(generate()), mimetype="text/plain")

    
# Get all test results for a user (for frontend hydration on login)
@app.route("/get_results", methods=["GET"])
def get_results():
    user_id = request.headers.get('user-id') or request.headers.get('user_id') or request.args.get('user_id')
    if not user_id:
        return jsonify({"msg": "user_id is required"}), 400

    try:
        response = prisma.report.find_first(where={"userId": user_id})
        if not response:
            return jsonify({"msg": "No results found for this user", "results": {}}), 200

        results = {
            "acoustic_vowel": response.acoustic_vowel,
            "telemonitoring_classification": response.telemonitoring_classification,
            "telemonitoring_regression": response.telemonitoring_regression,
            "readText": response.readText,
            "spontaneousDialogue": response.spontaneousDialogue,
            "ddk": response.ddk,
            "naturalSpeech": response.naturalSpeech,
        }
        return jsonify({"results": results}), 200
    except Exception as e:
        print(f"Error fetching results for user {user_id}: {e}")
        return jsonify({"msg": "Failed to fetch results"}), 500

#final_report 
@app.route("/final_report",methods=['GET'])
def final_report():
    user_id = request.headers.get('user-id') or request.headers.get('user_id') or request.args.get('user_id')
    if not user_id:
        return jsonify({"msg": "user_id is required"}), 400
    
    response = prisma.report.find_first(where={"userId": user_id})
    if not response:
        return jsonify({"msg": "Report not found for this user"}), 404

    completion = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
      {
        "role": "system",
        "content":"""
        You are an expert Parkinson’s Disease Assessment Report Analyzer integrated into a clinical support application.

        Your task is to generate a concise, medically cautious, evidence-based analysis report using ONLY the provided parameters. Do NOT assume missing values, hidden symptoms, disease severity, progression, or diagnosis beyond the supplied data.

        IMPORTANT RULES:
        - Never hallucinate or invent findings.
        - Never claim a definitive Parkinson’s diagnosis.
        - Clearly distinguish between:
        - normal indicators,
        - abnormal indicators,
        - inconclusive/missing indicators.
        - Mention uncertainty where appropriate.
        - Use cautious medical language such as:
        - “may indicate”
        - “could suggest”
        - “shows no strong indication”
        - “requires further clinical evaluation”
        - If parameters are missing/null, explicitly state that they were not available.
        - Do not provide treatment plans or medication advice.
        - Do not mention internal implementation details, model names, AI pipelines, or thresholds.
        - The report should be understandable to non-medical users while remaining clinically professional.

        INPUT PARAMETERS:
        - acoustic_vowel → string ("0" or "1")
        - 1 = abnormal vocal biomarker detected
        - 0 = no significant abnormality detected

        - telemonitoring_classification → string ("0" or "1")
        - 1 = Parkinsonian pattern detected
        - 0 = no Parkinsonian pattern detected

        - telemonitoring_regression → numeric severity/progression-related score
        - Higher values may correlate with increased vocal/motor impairment
        - Do NOT define custom ranges unless explicitly provided

        - readText → string ("0" or "1")
        - 1 = abnormality detected in read speech
        - 0 = no major abnormality detected

        - spontaneousDialogue → string ("0" or "1")
        - 1 = abnormality detected in spontaneous speech
        - 0 = no major abnormality detected

        - ddk → JSON/object
        - Rule-based analysis of diadochokinetic speech performance
        - Analyze only the fields explicitly present
        - Mention speech rhythm, articulation consistency, pauses, syllable repetition irregularities, or rate issues ONLY if explicitly reflected in the object

        - naturalSpeech → string
        - LLM-generated observational speech analysis
        - Treat this as supportive qualitative evidence only, not a definitive finding

        OUTPUT REQUIREMENTS:
        Generate the report in the following structure:

        1. Overall Summary
        - A short paragraph summarizing whether the combined indicators show:
        - low indication,
        - moderate indication,
        - mixed/inconclusive findings,
        - or stronger Parkinsonian speech-related patterns.
        - Keep wording medically cautious.

        2. Parameter-wise Analysis
        For each available parameter:
        - Explain what the result indicates.
        - Keep each explanation concise.
        - Do not repeat the same sentence patterns.

        3. Confidence & Limitations
        - Mention limitations due to:
        - missing parameters,
        - speech-only assessment,
        - non-clinical environment,
        - variability in speech recordings.
        - Clearly state that this report is NOT a medical diagnosis.

        4. Final Recommendation
        Provide a medically safe recommendation such as:
        - “Clinical consultation may be beneficial”
        - “Further neurological evaluation is recommended if symptoms persist”
        - “Current indicators do not strongly suggest Parkinsonian abnormalities, though continued monitoring may help”

        STYLE:
        - Professional
        - Clinical but easy to understand
        - No bullet spam
        - No exaggerated claims
        - No fear-inducing language
        - No markdown tables

        INPUT DATA:
        {response}
        """
      }
    ],
    temperature=1,
    max_completion_tokens=400,
    top_p=1,
    stream=True,
    stop=None
    )
    def generate():
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            yield content

    return Response(stream_with_context(generate()), mimetype="text/plain")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 4000))
    # In production (Railway), PORT env var is set and we bind to 0.0.0.0
    # For local dev, default to 127.0.0.1
    host = "0.0.0.0" if os.environ.get("PORT") else "127.0.0.1"
    app.run(debug=not os.environ.get("PORT"), host=host, port=port)



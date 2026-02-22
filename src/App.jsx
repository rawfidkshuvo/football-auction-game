import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, runTransaction, getDoc } from 'firebase/firestore';
import { Trophy, Clock, Users, Play, DollarSign, Shield, List, AlertCircle, CheckCircle, Settings, Save, Check, Download, Upload } from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDvkKTNS7ZMi4IOtsFy2KZ3iMOq4jGAQzk",
  authDomain: "club-e1344.firebaseapp.com",
  projectId: "club-e1344",
  storageBucket: "club-e1344.firebasestorage.app",
  messagingSenderId: "1061367534790",
  appId: "1:1061367534790:web:0119bc50d987a465d673c7"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'billion-dollar-club';

// --- CONSTANTS & CONFIG ---
const POSITIONS = ['GK', 'LB', 'CB', 'RB', 'DMF', 'CMF', 'LW', 'FW', 'RW'];
const POSITION_COUNTS = { GK: 1, LB: 1, CB: 2, RB: 1, DMF: 1, CMF: 2, LW: 1, FW: 1, RW: 1 };
const CATEGORIES = { S: 60, A: 40, B: 20 };
const BUDGET = 1000;

// Pitch Coordinates for rendering formation (percentages)
const PITCH_COORDS = {
  GK: [{ top: '85%', left: '50%' }],
  LB: [{ top: '65%', left: '15%' }],
  CB: [{ top: '70%', left: '35%' }, { top: '70%', left: '65%' }],
  RB: [{ top: '65%', left: '85%' }],
  DMF: [{ top: '50%', left: '50%' }],
  CMF: [{ top: '35%', left: '30%' }, { top: '35%', left: '70%' }],
  LW: [{ top: '15%', left: '20%' }],
  FW: [{ top: '10%', left: '50%' }],
  RW: [{ top: '15%', left: '80%' }]
};

// --- HELPER FUNCTIONS ---
const generateId = () => Math.random().toString(36).substring(2, 6).toUpperCase();

// Generate a blank roster template up to max possible rounds (7)
const generateDefaultRoster = () => {
  const template = {};
  Object.entries(POSITION_COUNTS).forEach(([pos, count]) => {
    template[pos] = [];
    for (let i = 0; i < count * 7; i++) {
      const cat = i < count * 2 ? 'S' : (i < count * 4 ? 'A' : 'B');
      template[pos].push({ name: `${pos}${i + 1}`, category: cat });
    }
  });
  return template;
};

const generatePool = (playerCount, rosterTemplate) => {
  let pool = [];
  let idCounter = 1;
  const rounds = playerCount + 1;

  Object.entries(POSITION_COUNTS).forEach(([pos, count]) => {
    const totalNeeded = count * rounds;
    for (let i = 0; i < totalNeeded; i++) {
      const template = rosterTemplate[pos][i];
      pool.push({
        id: `p${idCounter++}`,
        name: template.name,
        position: pos,
        category: template.category,
        basePrice: CATEGORIES[template.category]
      });
    }
  });
  
  return pool.sort(() => Math.random() - 0.5);
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('bdc_playerName') || '');
  const [roomId, setRoomId] = useState(() => localStorage.getItem('bdc_roomId') || '');
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 1. Initialize Firebase Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen to Room Data
  useEffect(() => {
    if (!user || !roomId) {
      setRoom(null);
      return;
    }
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        setRoom({ id: docSnap.id, ...docSnap.data() });
      } else {
        setError('Room not found or deleted.');
        setRoom(null);
        setRoomId('');
        localStorage.removeItem('bdc_roomId');
      }
    }, (err) => {
      console.error(err);
      setError('Failed to sync room data.');
    });

    return () => unsubscribe();
  }, [user, roomId]);

  // 3. Game Loop (Dealer logic)
  useEffect(() => {
    if (!room || room.status !== 'bidding') return;

    const interval = setInterval(async () => {
      const state = room.auctionState;
      if (!state) return;
      
      if (state.phase === 'bidding' && Date.now() > state.endTime + 500) {
        resolveAuction();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room]);

  // --- ACTIONS ---
  const createRoom = async () => {
    if (!playerName.trim()) return setError('Please enter your name.');
    
    let initialRoster = generateDefaultRoster();
    
    // Fetch persistently saved global roster, if available
    try {
      const globalRosterRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global_roster');
      const docSnap = await getDoc(globalRosterRef);
      if (docSnap.exists() && docSnap.data().template) {
        initialRoster = docSnap.data().template;
      }
    } catch (err) {
      console.error("Failed to fetch global roster:", err);
    }

    const newRoomId = generateId();
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newRoomId);
    
    await setDoc(roomRef, {
      hostId: user.uid,
      status: 'lobby',
      rosterTemplate: initialRoster,
      participants: {
        [user.uid]: { name: playerName, budget: BUDGET, team: [] }
      }
    });
    setRoomId(newRoomId);
    localStorage.setItem('bdc_playerName', playerName);
    localStorage.setItem('bdc_roomId', newRoomId);
    setError('');
  };

  const joinRoom = async (idToJoin) => {
    if (!playerName.trim()) return setError('Please enter your name.');
    if (!idToJoin.trim()) return setError('Please enter a room code.');
    
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', idToJoin.toUpperCase());
    try {
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        if (!docSnap.exists()) throw new Error("Room does not exist.");
        const data = docSnap.data();
        
        // Allow rejoining if the game started but the user is already a participant
        if (data.status !== 'lobby' && !data.participants[user.uid]) {
          throw new Error("Game already started.");
        }
        if (Object.keys(data.participants).length >= 6 && !data.participants[user.uid]) {
          throw new Error("Room is full (max 6).");
        }
        
        // Add user if they are not already in the room
        if (!data.participants[user.uid]) {
          transaction.update(roomRef, {
            [`participants.${user.uid}`]: { name: playerName, budget: BUDGET, team: [] }
          });
        }
      });
      setRoomId(idToJoin.toUpperCase());
      localStorage.setItem('bdc_playerName', playerName);
      localStorage.setItem('bdc_roomId', idToJoin.toUpperCase());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  const updateRosterTemplate = async (newRoster) => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    await updateDoc(roomRef, { rosterTemplate: newRoster });

    // Save modifications to the global settings so future games reuse this roster
    try {
      const globalRosterRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global_roster');
      await setDoc(globalRosterRef, { template: newRoster });
    } catch (err) {
      console.error("Failed to save global roster:", err);
    }
  };

  const startGame = async () => {
    const pCount = Object.keys(room.participants).length;
    // Fallback in case old room doesn't have template
    const template = room.rosterTemplate || generateDefaultRoster(); 
    const pool = generatePool(pCount, template);
    const firstPlayer = pool[0];
    const queue = pool.slice(1).map(p => p.id);

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    await updateDoc(roomRef, {
      status: 'bidding',
      pool: pool,
      auctionState: {
        phase: 'bidding',
        activePlayerId: firstPlayer.id,
        highestBidder: null,
        currentBid: firstPlayer.basePrice,
        endTime: Date.now() + 30000,
        queue: queue,
        readyPlayers: []
      }
    });
  };

  const placeBid = async (type) => { 
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    try {
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        const data = docSnap.data();
        const state = data.auctionState;
        
        if (data.status !== 'bidding' || state.phase !== 'bidding') return;
        
        const isStart = type === 'start';
        const bump = isStart ? 0 : parseInt(type);
        const newBid = isStart ? state.currentBid : state.currentBid + bump;

        const myData = data.participants[user.uid];
        if (myData.budget < newBid) throw new Error("Not enough budget!");

        const activePlayer = data.pool.find(p => p.id === state.activePlayerId);
        const myPosCount = myData.team.filter(p => p.position === activePlayer.position).length;
        if (myPosCount >= POSITION_COUNTS[activePlayer.position]) throw new Error("Position is already filled!");

        let newEndTime = state.endTime;
        const now = Date.now();
        if (newEndTime - now < 10000) {
          newEndTime = now + 10000;
        }

        transaction.update(roomRef, {
          'auctionState.highestBidder': user.uid,
          'auctionState.currentBid': newBid,
          'auctionState.endTime': newEndTime
        });
      });
    } catch (err) {
      console.log("Bid rejected:", err.message);
    }
  };

  const resolveAuction = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    try {
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        const data = docSnap.data();
        const state = data.auctionState;
        
        if (data.status !== 'bidding' || state.phase !== 'bidding') return;
        if (Date.now() < state.endTime) return; 

        const updates = {};
        
        if (state.highestBidder) {
          const winner = data.participants[state.highestBidder];
          const player = data.pool.find(p => p.id === state.activePlayerId);
          updates[`participants.${state.highestBidder}.budget`] = winner.budget - state.currentBid;
          updates[`participants.${state.highestBidder}.team`] = [...winner.team, { ...player, purchasedPrice: state.currentBid }];
        }

        updates['auctionState.phase'] = 'sold';
        updates['auctionState.lastWinner'] = state.highestBidder;
        updates['auctionState.lastPrice'] = state.currentBid;
        updates['auctionState.readyPlayers'] = [];

        transaction.update(roomRef, updates);
      });
    } catch (err) {
      console.error("Resolve error:", err);
    }
  };

  const toggleReady = async () => {
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    try {
      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(roomRef);
        const data = docSnap.data();
        const state = data.auctionState;
        
        if (data.status !== 'bidding' || state.phase !== 'sold') return;

        let readyList = state.readyPlayers || [];
        if (!readyList.includes(user.uid)) {
          readyList.push(user.uid);
        }

        const pCount = Object.keys(data.participants).length;
        
        // If everyone is ready, transition to next player or end
        if (readyList.length >= pCount) {
           if (state.queue.length > 0) {
              const nextPlayerId = state.queue[0];
              const nextPlayer = data.pool.find(p => p.id === nextPlayerId);
              transaction.update(roomRef, {
                'auctionState.phase': 'bidding',
                'auctionState.activePlayerId': nextPlayerId,
                'auctionState.queue': state.queue.slice(1),
                'auctionState.highestBidder': null,
                'auctionState.currentBid': nextPlayer.basePrice,
                'auctionState.endTime': Date.now() + 30000,
                'auctionState.readyPlayers': [],
                'auctionState.lastWinner': null,
                'auctionState.lastPrice': null
              });
           } else {
              transaction.update(roomRef, { status: 'finished' });
           }
        } else {
           // Otherwise just mark me as ready
           transaction.update(roomRef, { 'auctionState.readyPlayers': readyList });
        }
      });
    } catch(err) {
      console.error("Ready toggle error:", err);
    }
  };

  const leaveRoom = () => {
    setRoomId('');
    setRoom(null);
    localStorage.removeItem('bdc_roomId');
  };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-2 sm:p-4 md:p-8 pb-16 w-full overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full">
        
        {/* RESPONSIVE HEADER */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 md:mb-8 pb-4 border-b border-slate-700 gap-3">
          <div className="flex items-center justify-between w-full sm:w-auto gap-2 md:gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-yellow-400 flex-shrink-0" />
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold tracking-tight">Billion Dollar Club</h1>
            </div>
            {/* Mobile Leave Button */}
            {room && (
              <button onClick={leaveRoom} className="sm:hidden text-xs text-red-400 hover:text-red-300 transition py-1 px-2 border border-red-900/50 rounded bg-red-900/10">Leave</button>
            )}
          </div>
          {room && (
            <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-start sm:justify-end">
              <span className="bg-slate-800 px-2 py-1 md:px-3 md:py-1 rounded text-xs md:text-sm font-mono border border-slate-700 w-full sm:w-auto text-center sm:text-left">
                Room: <span className="text-blue-400 font-bold">{room.id}</span>
              </span>
              {/* Desktop Leave Button */}
              <button onClick={leaveRoom} className="hidden sm:block text-xs md:text-sm text-red-400 hover:text-red-300 transition px-2 py-1">Leave</button>
            </div>
          )}
        </header>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 p-2 sm:p-3 rounded mb-4 sm:mb-6 flex items-start sm:items-center gap-2 text-xs sm:text-sm md:text-base">
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0" /> {error}
          </div>
        )}

        {/* SCREENS */}
        {!roomId && (
          <JoinScreen playerName={playerName} setPlayerName={setPlayerName} onCreate={createRoom} onJoin={joinRoom} />
        )}
        {room?.status === 'lobby' && (
          <LobbyScreen 
            room={room} 
            userId={user.uid} 
            onStart={startGame} 
            onSaveRoster={updateRosterTemplate}
          />
        )}
        {room?.status === 'bidding' && (
          <BiddingScreen 
            room={room} 
            userId={user.uid} 
            placeBid={placeBid} 
            toggleReady={toggleReady}
          />
        )}
        {room?.status === 'finished' && (
          <FinishedScreen room={room} />
        )}
      </div>
    </div>
  );
}

// --- SUB-COMPONENTS ---

function JoinScreen({ playerName, setPlayerName, onCreate, onJoin }) {
  const [joinCode, setJoinCode] = useState('');

  return (
    <div className="max-w-md mx-auto mt-6 sm:mt-10 md:mt-20 bg-slate-800 p-4 sm:p-6 md:p-8 rounded-xl shadow-2xl border border-slate-700 w-full">
      <h2 className="text-base sm:text-lg md:text-xl font-semibold mb-4 sm:mb-6 text-center">Enter the Auction House</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-xs md:text-sm text-slate-400 mb-1">Manager Name</label>
          <input 
            type="text" 
            value={playerName} 
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded p-2 sm:p-3 text-sm md:text-base focus:outline-none focus:border-yellow-500 transition"
            placeholder="e.g. Pep Guardiola"
          />
        </div>
        <div className="pt-4 border-t border-slate-700">
          <button 
            onClick={onCreate}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 sm:py-3 rounded transition flex items-center justify-center gap-2 text-sm md:text-base"
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" /> Create New Room
          </button>
        </div>
        <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-700"></div>
            <span className="flex-shrink-0 mx-4 text-slate-500 text-[10px] sm:text-xs md:text-sm">or</span>
            <div className="flex-grow border-t border-slate-700"></div>
        </div>
        <div className="flex gap-2">
          <input 
            type="text" 
            value={joinCode} 
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="flex-1 min-w-0 bg-slate-900 border border-slate-600 rounded p-2 sm:p-3 font-mono text-center text-sm md:text-base focus:outline-none focus:border-yellow-500 transition"
            placeholder="ROOM CODE"
            maxLength={4}
          />
          <button 
            onClick={() => onJoin(joinCode)}
            className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 sm:py-3 px-3 sm:px-4 md:px-6 rounded transition text-sm md:text-base flex-shrink-0"
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}

function LobbyScreen({ room, userId, onStart, onSaveRoster }) {
  const isHost = room.hostId === userId;
  const players = Object.values(room.participants);
  const [editingSettings, setEditingSettings] = useState(false);
  const [localRoster, setLocalRoster] = useState(room.rosterTemplate || generateDefaultRoster());
  const [selectedPos, setSelectedPos] = useState('GK');

  // Sync local roster if room changes
  useEffect(() => {
    if (room.rosterTemplate) setLocalRoster(room.rosterTemplate);
  }, [room.rosterTemplate]);

  const handleRosterChange = (index, field, value) => {
    const updatedPos = [...localRoster[selectedPos]];
    updatedPos[index] = { ...updatedPos[index], [field]: value };
    setLocalRoster({ ...localRoster, [selectedPos]: updatedPos });
  };

  const handleSaveSettings = () => {
    onSaveRoster(localRoster);
    setEditingSettings(false);
  };

  const exportCSV = () => {
    let csvContent = "Position,Name,Category\n";
    POSITIONS.forEach(pos => {
      if (localRoster[pos]) {
        localRoster[pos].forEach(p => {
          csvContent += `${pos},${p.name},${p.category}\n`;
        });
      }
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "bdc_roster.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n');
      const newRoster = {};
      POSITIONS.forEach(pos => newRoster[pos] = []);

      lines.forEach((line, index) => {
        if (index === 0 && line.toLowerCase().includes('position')) return; // Skip header
        const parts = line.split(',');
        if (parts.length >= 3) {
          const pos = parts[0]?.trim();
          const name = parts[1]?.trim();
          const category = parts[2]?.trim().toUpperCase();
          if (POSITIONS.includes(pos) && name && ['S', 'A', 'B'].includes(category)) {
            newRoster[pos].push({ name, category });
          }
        }
      });

      // Pad any missing slots with default placeholders to prevent game crashes
      POSITIONS.forEach(pos => {
        const requiredCount = POSITION_COUNTS[pos] * 7;
        while (newRoster[pos].length < requiredCount) {
           const i = newRoster[pos].length;
           const cat = i < POSITION_COUNTS[pos] * 2 ? 'S' : (i < POSITION_COUNTS[pos] * 4 ? 'A' : 'B');
           newRoster[pos].push({ name: `${pos}${i + 1}`, category: cat });
        }
      });

      setLocalRoster(newRoster);
    };
    reader.readAsText(file);
    e.target.value = null; // Reset input so the same file can be uploaded again if needed
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 w-full">
      <div className="bg-slate-800 rounded-xl p-4 sm:p-5 md:p-6 border border-slate-700 order-2 lg:order-1 w-full overflow-hidden">
        <h2 className="text-base sm:text-lg md:text-xl font-semibold mb-3 sm:mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
          Participants ({players.length}/6)
        </h2>
        <ul className="space-y-2">
          {players.map((p, i) => (
            <li key={i} className="bg-slate-900 p-2 sm:p-3 rounded flex items-center justify-between border border-slate-800 text-xs sm:text-sm md:text-base w-full overflow-hidden">
              <span className="font-medium truncate pr-2 min-w-0 flex-1">{p.name}</span>
              <span className="text-green-400 font-mono shrink-0 ml-2">${p.budget}m</span>
            </li>
          ))}
        </ul>
        {players.length < 3 && (
          <p className="text-yellow-500 text-[10px] sm:text-xs md:text-sm mt-3 sm:mt-4 text-center lg:text-left">
            Waiting for at least 3 players to start a balanced game...
          </p>
        )}
      </div>
      
      <div className="bg-slate-800 rounded-xl p-4 sm:p-6 border border-slate-700 flex flex-col justify-center items-center text-center order-1 lg:order-2 w-full">
        {!editingSettings ? (
          <>
            <Shield className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 text-slate-600 mb-3 sm:mb-4" />
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-1 sm:mb-2">Ready to Bid?</h2>
            <p className="text-xs sm:text-sm md:text-base text-slate-400 mb-4 sm:mb-6 max-w-sm">
              Each manager starts with a $1 Billion budget to assemble an 11-player squad. 
            </p>
            
            {isHost ? (
              <div className="flex flex-col gap-3 w-full sm:w-auto">
                <button 
                  onClick={onStart}
                  className="bg-green-600 hover:bg-green-500 text-white text-sm sm:text-base md:text-lg font-bold py-2 px-5 sm:py-3 sm:px-6 md:py-4 md:px-8 rounded-full shadow-lg transition flex items-center justify-center gap-2 w-full"
                >
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> Start Auction
                </button>
                <button 
                  onClick={() => setEditingSettings(true)}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm md:text-base font-semibold py-2 px-4 rounded-full transition flex items-center justify-center gap-2 w-full"
                >
                  <Settings className="w-4 h-4" /> Edit Roster Settings
                </button>
              </div>
            ) : (
              <p className="text-slate-300 animate-pulse font-medium text-xs sm:text-sm md:text-base">Waiting for host to start...</p>
            )}
          </>
        ) : (
          <div className="w-full text-left overflow-hidden">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-3 sm:mb-4">
               <h3 className="font-bold text-base sm:text-lg flex items-center gap-1.5 sm:gap-2"><Settings className="w-4 h-4 sm:w-5 h-5 flex-shrink-0"/> <span className="truncate">Edit Roster</span></h3>
               <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                 <label className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 sm:px-3 sm:py-1 rounded text-[10px] sm:text-xs font-semibold flex items-center gap-1 cursor-pointer transition">
                   <Upload className="w-3 h-3"/> Import
                   <input type="file" accept=".csv" onChange={importCSV} className="hidden" />
                 </label>
                 <button onClick={exportCSV} className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1.5 sm:px-3 sm:py-1 rounded text-[10px] sm:text-xs font-semibold flex items-center gap-1 transition">
                   <Download className="w-3 h-3"/> Export
                 </button>
                 <button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 sm:px-4 sm:py-1 rounded text-xs sm:text-sm font-semibold flex items-center gap-1 flex-shrink-0 transition">
                   <Save className="w-3 h-3 sm:w-4 sm:h-4"/> Save
                 </button>
               </div>
             </div>
             
             <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 mb-3 sm:mb-4 [&::-webkit-scrollbar]:hidden border-b border-slate-700 w-full">
               {POSITIONS.map(pos => (
                 <button 
                   key={pos} 
                   onClick={() => setSelectedPos(pos)}
                   className={`px-2 py-1 sm:px-3 sm:py-1 rounded-t font-bold text-xs sm:text-sm flex-shrink-0 ${selectedPos === pos ? 'bg-slate-700 text-yellow-400' : 'text-slate-400 hover:text-white'}`}
                 >
                   {pos}
                 </button>
               ))}
             </div>

             <div className="max-h-[250px] sm:max-h-[300px] overflow-y-auto pr-1 sm:pr-2 space-y-1.5 sm:space-y-2 [&::-webkit-scrollbar]:hidden w-full">
               {/* Show players up to max possible needed for 6 participants (7 rounds) */}
               {localRoster[selectedPos]?.slice(0, POSITION_COUNTS[selectedPos] * 7).map((p, i) => (
                 <div key={i} className="flex gap-1.5 sm:gap-2 bg-slate-900 p-1.5 sm:p-2 rounded items-center w-full">
                    <span className="text-slate-500 text-[10px] sm:text-xs w-4 sm:w-6 font-mono flex-shrink-0">{i+1}.</span>
                    <input 
                      type="text" 
                      value={p.name} 
                      onChange={(e) => handleRosterChange(i, 'name', e.target.value)}
                      className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-1.5 sm:px-2 py-1 text-xs sm:text-sm focus:outline-none focus:border-blue-500"
                    />
                    <select 
                      value={p.category}
                      onChange={(e) => handleRosterChange(i, 'category', e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-1 sm:px-2 py-1 text-xs sm:text-sm font-bold focus:outline-none focus:border-blue-500 flex-shrink-0"
                    >
                      <option value="S">S</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                    </select>
                 </div>
               ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BiddingScreen({ room, userId, placeBid, toggleReady }) {
  const [timeLeft, setTimeLeft] = useState(30);
  const state = room.auctionState;
  const activePlayer = room.pool.find(p => p.id === state.activePlayerId);
  const me = room.participants[userId];
  const participantCount = Object.keys(room.participants).length;
  const readyCount = state.readyPlayers?.length || 0;
  const iAmReady = state.readyPlayers?.includes(userId);

  useEffect(() => {
    if (state.phase !== 'bidding') return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((state.endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
    }, 250);
    return () => clearInterval(interval);
  }, [state.endTime, state.phase]);

  const categoryColors = {
    S: "bg-yellow-400 text-black border-yellow-500",
    A: "bg-slate-300 text-black border-slate-400",
    B: "bg-orange-500 text-white border-orange-600"
  };

  const myPosCount = me.team.filter(p => p.position === activePlayer?.position).length;
  const canBidPosition = myPosCount < POSITION_COUNTS[activePlayer?.position];
  const amIHighest = state.highestBidder === userId;

  // Calculate remaining players in each position
  const remainingCounts = {};
  POSITIONS.forEach(pos => remainingCounts[pos] = 0);
  state.queue.forEach(pid => {
    const p = room.pool.find(x => x.id === pid);
    if (p) remainingCounts[p.position]++;
  });

  return (
    <div className="grid lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 w-full">
      
      {/* MOBILE HUD - Only visible on small screens */}
      <div className="lg:hidden bg-slate-800 p-3 sm:p-4 rounded-xl border border-slate-700 shadow-lg sticky top-0 z-20 w-full flex flex-col gap-2">
         <div className="flex justify-between items-center w-full">
            <div className="flex-1 min-w-0 pr-2">
               <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider truncate">My Budget</div>
               <div className={`text-base sm:text-lg lg:text-xl font-mono font-bold truncate ${me.budget < 200 ? 'text-red-400' : 'text-green-400'}`}>${me.budget}m</div>
            </div>
            <div className="text-right flex-shrink-0 pl-2 border-l border-slate-700">
               <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider">Squad</div>
               <div className="text-base sm:text-lg lg:text-xl font-bold text-white">{me.team.length} <span className="text-xs sm:text-sm text-slate-500">/ 11</span></div>
            </div>
         </div>
         <div className="w-full bg-slate-900 rounded-full h-1.5 mt-1">
           <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${(me.team.length / 11) * 100}%` }}></div>
         </div>
      </div>

      {/* AUCTION BLOCK */}
      <div className="lg:col-span-2 space-y-3 sm:space-y-4 md:space-y-6 w-full overflow-hidden">
        <div className="bg-slate-800 rounded-xl p-3 sm:p-6 md:p-8 border border-slate-700 shadow-xl relative overflow-hidden w-full">
          {/* Active Player Card */}
          <div className="text-center mb-4 sm:mb-6 md:mb-8 relative z-10 w-full">
            <div className={`inline-block px-2 py-0.5 sm:px-3 sm:py-1 md:px-4 md:py-1 rounded-full border text-[10px] sm:text-xs md:text-sm font-semibold tracking-widest mb-2 sm:mb-3 md:mb-4 uppercase
               ${state.phase === 'sold' ? 'bg-green-900/50 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-400'}
            `}>
              {state.phase === 'sold' ? 'Auction Ended' : 'Now Bidding'}
            </div>
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-black mb-1 sm:mb-2 truncate px-1 w-full">{activePlayer?.name}</h2>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 md:gap-4 mt-2 sm:mt-3 md:mt-4">
              <span className="text-base sm:text-xl md:text-2xl font-bold px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 bg-slate-900 rounded-lg text-blue-400 border border-blue-900/50">
                {activePlayer?.position}
              </span>
              <span className={`text-xs sm:text-base md:text-xl font-bold px-2 py-1 sm:px-3 sm:py-1.5 md:px-4 md:py-2 rounded-lg border ${categoryColors[activePlayer?.category]}`}>
                Class {activePlayer?.category}
              </span>
            </div>
          </div>

          {/* Auction Info */}
          <div className="grid grid-cols-2 gap-1.5 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
            <div className="bg-slate-900 rounded-lg p-2 sm:p-3 md:p-4 border border-slate-700 flex flex-col items-center justify-center text-center w-full overflow-hidden">
              <span className="text-slate-400 text-[8px] sm:text-[10px] md:text-sm uppercase font-semibold mb-0.5 sm:mb-1">
                {state.phase === 'sold' ? 'Final Price' : (state.highestBidder ? 'Current Bid' : 'Base Price')}
              </span>
              <span className="text-xl sm:text-3xl md:text-4xl font-mono font-bold text-green-400 truncate w-full px-1">
                ${state.phase === 'sold' ? state.lastPrice : state.currentBid}m
              </span>
              {state.phase !== 'sold' && (
                <span className="text-[8px] sm:text-[10px] md:text-sm mt-0.5 sm:mt-1 md:mt-2 text-slate-300 truncate w-full px-1">
                  {state.highestBidder 
                    ? (state.highestBidder === userId ? 'You lead!' : `${room.participants[state.highestBidder]?.name || 'Someone'} leads`) 
                    : 'No bids yet'}
                </span>
              )}
            </div>
            <div className="bg-slate-900 rounded-lg p-2 sm:p-3 md:p-4 border border-slate-700 flex flex-col items-center justify-center w-full overflow-hidden">
              <span className="text-slate-400 text-[8px] sm:text-[10px] md:text-sm uppercase font-semibold mb-0.5 sm:mb-1">Time Left</span>
              <span className={`text-2xl sm:text-4xl md:text-5xl font-mono font-black truncate ${state.phase === 'sold' ? 'text-slate-500' : (timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white')}`}>
                {state.phase === 'sold' ? '0s' : `${timeLeft}s`}
              </span>
            </div>
          </div>

          {/* Controls Area */}
          <div className="bg-slate-900/50 p-2 sm:p-3 md:p-4 rounded-xl border border-slate-700 w-full">
            
            {/* SOLD PHASE - Manual Ready Transition */}
            {state.phase === 'sold' ? (
              <div className="text-center space-y-4">
                 <div className="p-3 md:p-4 bg-slate-800 rounded-lg border border-slate-600">
                    <div className="text-sm md:text-base text-slate-300 mb-1">Player awarded to</div>
                    <div className="text-xl md:text-2xl font-bold text-yellow-400">
                      {state.lastWinner ? room.participants[state.lastWinner]?.name : 'Unsold (Passed)'}
                    </div>
                 </div>
                 
                 <div className="flex flex-col items-center gap-2">
                   <button 
                     onClick={toggleReady}
                     disabled={iAmReady}
                     className={`w-full max-w-sm font-bold py-3 md:py-4 rounded-lg text-sm sm:text-base md:text-lg transition shadow-lg flex items-center justify-center gap-2
                        ${iAmReady ? 'bg-green-600 text-white opacity-80 cursor-default' : 'bg-blue-600 hover:bg-blue-500 text-white'}
                     `}
                   >
                     {iAmReady ? <><Check className="w-5 h-5"/> Ready</> : 'Ready for Next Bid'}
                   </button>
                   <div className="text-xs sm:text-sm text-slate-400 font-mono">
                     {readyCount} / {participantCount} Managers Ready
                   </div>
                 </div>
              </div>
            ) : (
              /* BIDDING PHASE - Normal Controls */
              <>
                {!canBidPosition ? (
                  <div className="text-center p-2 sm:p-3 md:p-4 text-red-400 text-xs sm:text-sm md:text-base font-semibold bg-red-900/20 rounded-lg border border-red-900/50">
                    Position full.
                  </div>
                ) : amIHighest ? (
                  <div className="text-center p-2 sm:p-3 md:p-4 text-green-400 text-xs sm:text-sm md:text-base font-semibold bg-green-900/20 rounded-lg border border-green-900/50">
                    You hold the highest bid.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1 sm:gap-2 md:gap-3">
                    {!state.highestBidder ? (
                      <button 
                        onClick={() => placeBid('start')}
                        className="col-span-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 sm:py-3 md:py-4 rounded-lg text-xs sm:text-sm md:text-lg transition shadow-lg w-full truncate px-1"
                      >
                        Start Bid (${state.currentBid}m)
                      </button>
                    ) : (
                      <>
                        <button onClick={() => placeBid('5')} className="bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white font-bold py-2 sm:py-3 md:py-4 rounded-lg text-xs sm:text-sm md:text-xl transition w-full truncate">
                          +$5m
                        </button>
                        <button onClick={() => placeBid('10')} className="bg-slate-700 hover:bg-slate-600 border border-slate-500 text-white font-bold py-2 sm:py-3 md:py-4 rounded-lg text-xs sm:text-sm md:text-xl transition w-full truncate">
                          +$10m
                        </button>
                        <button onClick={() => placeBid('20')} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 sm:py-3 md:py-4 rounded-lg text-xs sm:text-sm md:text-xl transition shadow-lg shadow-blue-900/20 w-full truncate">
                          +$20m
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Pool Preview - Now showing counts by position */}
        <div className="bg-slate-800 rounded-xl p-3 sm:p-4 md:p-6 border border-slate-700 w-full overflow-hidden">
           <h3 className="text-xs sm:text-sm md:text-lg font-semibold mb-2 sm:mb-3 md:mb-4 flex items-center gap-1.5 sm:gap-2">
             <List className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5"/> Remaining by Position
           </h3>
           <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5 sm:gap-2 w-full">
              {POSITIONS.map(pos => (
                <div key={pos} className={`bg-slate-900 border ${remainingCounts[pos] > 0 ? 'border-slate-600' : 'border-slate-800 opacity-50'} rounded py-2 px-1 text-center flex flex-col items-center justify-center`}>
                  <div className="font-bold text-xs sm:text-sm md:text-base text-blue-400">{pos}</div>
                  <div className="text-[10px] sm:text-xs text-slate-400">{remainingCounts[pos]} left</div>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* MY TEAM SIDEBAR */}
      <div className="space-y-3 sm:space-y-4 md:space-y-6 w-full">
        <div className="bg-slate-800 rounded-xl p-3 sm:p-4 md:p-6 border border-slate-700 lg:sticky lg:top-4 w-full">
          <div className="hidden lg:flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold">My Club</h3>
            <div className="text-right">
              <div className="text-sm text-slate-400 uppercase font-semibold">Budget</div>
              <div className={`text-2xl font-mono font-bold ${me.budget < 200 ? 'text-red-400' : 'text-green-400'}`}>
                ${me.budget}m
              </div>
            </div>
          </div>
          
          <div className="hidden lg:block mb-6">
            <div className="flex justify-between text-sm mb-2 text-slate-300">
              <span>Squad Filled</span>
              <span>{me.team.length} / 11</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2.5">
              <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${(me.team.length / 11) * 100}%` }}></div>
            </div>
          </div>

          <FormationPitch team={me.team} compact={true} />
          
          <div className="mt-3 sm:mt-4 md:mt-6 space-y-1.5 sm:space-y-2 max-h-[200px] sm:max-h-[250px] md:max-h-[300px] overflow-y-auto pr-1 md:pr-2 [&::-webkit-scrollbar]:hidden w-full">
             {me.team.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-slate-900 p-1.5 sm:p-2 rounded border border-slate-700/50 text-[10px] sm:text-xs md:text-sm w-full">
                   <div className="flex items-center gap-1 sm:gap-2 min-w-0 pr-2">
                      <span className="font-bold w-5 sm:w-6 md:w-8 text-blue-400 flex-shrink-0">{p.position}</span>
                      <span className="truncate">{p.name}</span>
                   </div>
                   <span className="font-mono text-green-400 flex-shrink-0">${p.purchasedPrice}m</span>
                </div>
             ))}
             {me.team.length === 0 && (
               <div className="text-center text-slate-500 py-3 sm:py-4 italic text-[10px] sm:text-xs md:text-sm">No players acquired yet.</div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinishedScreen({ room }) {
  const participants = Object.values(room.participants);
  
  participants.sort((a, b) => {
    const aQual = a.team.length === 11;
    const bQual = b.team.length === 11;
    if (aQual && !bQual) return -1;
    if (!aQual && bQual) return 1;
    return b.budget - a.budget;
  });

  return (
    <div className="space-y-4 sm:space-y-6 md:space-y-8 w-full">
      <div className="text-center space-y-1 sm:space-y-2 md:space-y-4 py-2 sm:py-4 md:py-8 w-full px-2">
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-200">
          Auction Concluded
        </h2>
        <p className="text-sm sm:text-base md:text-xl text-slate-400">Final Standings & Formations</p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 w-full">
        {participants.map((p, i) => {
          const isQualified = p.team.length === 11;
          return (
            <div key={i} className={`bg-slate-800 rounded-xl p-3 sm:p-4 md:p-6 border ${isQualified ? 'border-yellow-500/50' : 'border-red-500/50'} relative overflow-hidden w-full`}>
              {!isQualified && (
                <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-red-600 text-white text-[8px] sm:text-[10px] md:text-xs font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                  DISQUALIFIED
                </div>
              )}
              {isQualified && i === 0 && (
                <div className="absolute top-2 right-2 md:top-4 md:right-4 bg-yellow-500 text-black text-[8px] sm:text-[10px] md:text-xs font-bold px-1.5 py-0.5 sm:px-2 sm:py-1 rounded flex items-center gap-1">
                  <Trophy className="w-2 h-2 sm:w-3 sm:h-3 md:w-4 md:h-4" /> WINNER
                </div>
              )}
              
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-1 truncate pr-16 sm:pr-20 md:pr-24 w-full">{p.name}</h3>
              <div className="flex flex-wrap gap-x-2 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 text-[10px] sm:text-xs md:text-sm text-slate-400 mb-3 sm:mb-4 md:mb-6 w-full">
                <span>Budget Left: <strong className="text-white">${p.budget}m</strong></span>
                <span>Squad: <strong className={isQualified ? 'text-green-400' : 'text-red-400'}>{p.team.length}/11</strong></span>
              </div>
              
              <FormationPitch team={p.team} />
            </div>
          )
        })}
      </div>
    </div>
  );
}

function FormationPitch({ team, compact = false }) {
  const mappedPlayers = [];
  const counts = { ...POSITION_COUNTS };
  for (let key in counts) counts[key] = 0;

  team.forEach(player => {
    const pos = player.position;
    const index = counts[pos];
    if (PITCH_COORDS[pos] && PITCH_COORDS[pos][index]) {
      mappedPlayers.push({ ...player, coords: PITCH_COORDS[pos][index] });
      counts[pos]++;
    }
  });

  return (
    <div className={`relative w-full bg-green-700 border-2 border-white/50 rounded-lg overflow-hidden mx-auto shadow-inner ${compact ? 'aspect-[4/5] max-w-[240px] sm:max-w-[280px] md:max-w-sm' : 'aspect-[3/4]'}`}>
      {/* Pitch Markings */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute top-1/2 left-0 w-full h-[2px] bg-white -mt-[1px]"></div>
        <div className="absolute top-1/2 left-1/2 w-1/4 pt-[25%] border-2 border-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute top-0 left-1/4 w-1/2 h-1/6 border-2 border-t-0 border-white"></div>
        <div className="absolute bottom-0 left-1/4 w-1/2 h-1/6 border-2 border-b-0 border-white"></div>
      </div>

      {/* Players */}
      {mappedPlayers.map((p, i) => (
        <div 
          key={i} 
          className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
          style={{ top: p.coords.top, left: p.coords.left }}
        >
          <div className={`
            ${compact ? 'w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[7px] sm:text-[8px] md:text-[10px]' : 'w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-[8px] sm:text-[9px] md:text-xs'} 
            rounded-full flex items-center justify-center font-bold shadow-md
            ${p.category === 'S' ? 'bg-yellow-400 text-black border-2 border-yellow-200' : 
              p.category === 'A' ? 'bg-slate-200 text-black border-2 border-white' : 
              'bg-orange-500 text-white border-2 border-orange-300'}
          `}>
            {p.position}
          </div>
          <div className="flex flex-col items-center bg-black/70 rounded px-1 mt-0.5 sm:mt-1">
             <div className={`text-white font-semibold text-center whitespace-nowrap px-1 ${compact ? 'text-[7px] sm:text-[8px] md:text-[9px]' : 'text-[8px] sm:text-[9px] md:text-xs'}`}>
               {p.name}
             </div>
             {p.purchasedPrice !== undefined && (
               <div className={`text-yellow-400 font-mono font-bold text-center px-1 ${compact ? 'text-[6px] sm:text-[7px] md:text-[8px]' : 'text-[7px] sm:text-[8px] md:text-[10px]'}`}>
                 ${p.purchasedPrice}m
               </div>
             )}
          </div>
        </div>
      ))}
    </div>
  );
}
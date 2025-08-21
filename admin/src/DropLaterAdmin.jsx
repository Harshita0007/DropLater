import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3000/api';
const ADMIN_TOKEN = 'super-secret-admin-token-2024';

function App() {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [animatingRows, setAnimatingRows] = useState(new Set());

    const [formData, setFormData] = useState({
        title: '',
        body: '',
        releaseAt: '',
        webhookUrl: 'http://sink:4000/sink'
    });

    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const formatDateForAPI = (datetimeLocalValue) => {
        if (!datetimeLocalValue) return '';
        return new Date(datetimeLocalValue).toISOString();
    };

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE}/notes?page=1`, {
                headers: {
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                }
            });
            const data = await response.json();
            console.log('Fetched notes:', data.notes); 
            setNotes(data.notes || []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError('Failed to fetch notes');
        } finally {
            setLoading(false);
        }
    };

    const createNote = (e) => {
        e.preventDefault();

        const submitData = {
            ...formData,
            releaseAt: formatDateForAPI(formData.releaseAt)
        };

        console.log('Submitting data:', submitData); 

        setLoading(true);
        setError('');

        fetch(`${API_BASE}/notes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(submitData)
        })
            .then(response => response.json().then(data => ({ status: response.status, data })))
            .then(({ status, data }) => {
                if (status === 201) {
                    setSuccess('Note created successfully!');
                    setFormData({
                        title: '',
                        body: '',
                        releaseAt: '',
                        webhookUrl: 'http://sink:4000/sink'
                    });
                    setTimeout(() => setSuccess(''), 3000);
                    fetchNotes();
                } else {
                    console.error('API Error:', data);
                    setError(data.error || data.message || 'Failed to create note');
                }
            })
            .catch(err => {
                console.error('Network Error:', err);
                setError('Network error: ' + err.message);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    const replayNote = (noteId) => {
        console.log('Replaying note with ID:', noteId, typeof noteId); 

        setLoading(true);
        setError(''); 

       
        if (!noteId) {
            setError('Invalid note ID');
            setLoading(false);
            return;
        }

        const actualNoteId = noteId._id || noteId.id || noteId;
        console.log('Using note ID:', actualNoteId);

        fetch(`${API_BASE}/notes/${actualNoteId}/replay`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ADMIN_TOKEN}`,
                'Content-Type': 'application/json'
            }
        })
            .then(response => response.json().then(data => ({ status: response.status, data })))
            .then(({ status, data }) => {
                console.log('Replay response:', status, data);

                if (status === 200) {
                    setSuccess('Note replayed successfully!');
                    setTimeout(() => setSuccess(''), 3000);

                    setAnimatingRows(prev => new Set([...prev, actualNoteId]));
                    setTimeout(() => {
                        setAnimatingRows(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(actualNoteId);
                            return newSet;
                        });
                    }, 1000);

                    fetchNotes();
                } else {
                    console.error('Replay failed:', data);
                    setError(data.error || data.message || 'Failed to replay note');
                    setTimeout(() => setError(''), 5000);
                }
            })
            .catch(err => {
                console.error('Replay network error:', err);
                setError('Network error during replay: ' + err.message);
                setTimeout(() => setError(''), 5000);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchNotes();

        const interval = setInterval(fetchNotes, 5000);
        return () => clearInterval(interval);
    }, []);

    const getStatusColor = (status) => {
        switch (status) {
            case 'pending': return '#fbbf24';
            case 'delivered': return '#10b981';
            case 'failed': return '#f59e0b';
            case 'dead': return '#ef4444';
            default: return '#6b7280';
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'N/A';
        try {
            return new Date(dateStr).toLocaleString();
        } catch (e) {
            return 'Invalid Date';
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
            <h1 style={{ margin: '0 0 30px 0', color: '#1f2937' }}>DropLater Admin</h1>

            {success && (
                <div style={{
                    padding: '10px',
                    backgroundColor: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '4px',
                    marginBottom: '20px'
                }}>
                    {success}
                </div>
            )}

            {error && (
                <div style={{
                    padding: '10px',
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    borderRadius: '4px',
                    marginBottom: '20px'
                }}>
                    {error}
                </div>
            )}

            <div style={{
                backgroundColor: '#f9fafb',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '30px'
            }}>
                <h2 style={{ margin: '0 0 20px 0', color: '#374151' }}>Create New Note</h2>

                <div>
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Title
                        </label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px'
                            }}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Body
                        </label>
                        <textarea
                            value={formData.body}
                            onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px',
                                minHeight: '80px'
                            }}
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Release At
                        </label>
                        <input
                            type="datetime-local"
                            value={formData.releaseAt}
                            onChange={(e) => setFormData(prev => ({ ...prev, releaseAt: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px'
                            }}
                            required
                        />
                        <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                            Select a future date and time (or past date for immediate testing)
                        </small>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Webhook URL
                        </label>
                        <input
                            type="url"
                            value={formData.webhookUrl}
                            onChange={(e) => setFormData(prev => ({ ...prev, webhookUrl: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #d1d5db',
                                borderRadius: '4px'
                            }}
                            placeholder="http://sink:4000/sink"
                            required
                        />
                        <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                            URL where the note will be delivered via POST request
                        </small>
                    </div>

                    <button
                        onClick={createNote}
                        disabled={loading}
                        style={{
                            backgroundColor: '#3b82f6',
                            color: 'white',
                            padding: '10px 20px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1
                        }}
                    >
                        {loading ? 'Creating...' : 'Create Note'}
                    </button>
                </div>
            </div>

           
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, color: '#374151' }}>Notes</h2>
                    <button
                        onClick={fetchNotes}
                        disabled={loading}
                        style={{
                            backgroundColor: '#6b7280',
                            color: 'white',
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1
                        }}
                    >
                        {loading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb'
                    }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f3f4f6' }}>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    ID
                                </th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    Title
                                </th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    Status
                                </th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    Last Attempt
                                </th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    Release At
                                </th>
                                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {notes.map(note => {
                                const noteId = note._id || note.id;
                                return (
                                    <tr
                                        key={noteId}
                                        style={{
                                            borderBottom: '1px solid #e5e7eb',
                                            backgroundColor: animatingRows.has(noteId) ? '#dbeafe' : 'white',
                                            transition: 'background-color 1s ease'
                                        }}
                                    >
                                        <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace' }}>
                                            {noteId ? noteId.toString().slice(-8) : 'N/A'}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {note.title || 'N/A'}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                fontSize: '12px',
                                                fontWeight: 'bold',
                                                backgroundColor: getStatusColor(note.status) + '20',
                                                color: getStatusColor(note.status)
                                            }}>
                                                {note.status || 'unknown'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {note.attempts?.length > 0
                                                ? note.attempts[note.attempts.length - 1].statusCode || 'N/A'
                                                : 'N/A'
                                            }
                                        </td>
                                        <td style={{ padding: '12px', fontSize: '12px' }}>
                                            {formatDate(note.releaseAt)}
                                        </td>
                                        <td style={{ padding: '12px' }}>
                                            {(note.status === 'failed' || note.status === 'dead') && (
                                                <button
                                                    onClick={() => replayNote(noteId)}
                                                    disabled={loading}
                                                    style={{
                                                        backgroundColor: '#10b981',
                                                        color: 'white',
                                                        padding: '6px 12px',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        cursor: loading ? 'not-allowed' : 'pointer',
                                                        fontSize: '12px',
                                                        opacity: loading ? 0.6 : 1
                                                    }}
                                                >
                                                    Replay
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {notes.length === 0 && !loading && (
                    <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '40px' }}>
                        No notes found. Create your first note above.
                    </p>
                )}
            </div>
        </div>
    );
}

export default App;
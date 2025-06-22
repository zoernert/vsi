let isLoginMode = true;
let registrationEnabled = false;

document.addEventListener('DOMContentLoaded', async function() {
    const authForm = document.getElementById('auth-form');
    const authToggle = document.getElementById('auth-toggle');
    
    authForm.addEventListener('submit', handleAuth);
    authToggle.addEventListener('click', toggleAuthMode);
    
    // Check if already logged in
    if (localStorage.getItem('token')) {
        window.location.href = '/dashboard';
        return;
    }
    
    // Check registration status
    await checkRegistrationStatus();
});

async function checkRegistrationStatus() {
    try {
        const response = await fetch('/api/auth/registration-status');
        const data = await response.json();
        registrationEnabled = data.selfRegistrationEnabled;
        
        if (!registrationEnabled) {
            // Hide registration option
            const authSwitchElement = document.querySelector('.auth-switch');
            if (authSwitchElement) {
                authSwitchElement.innerHTML = `
                    <p style="color: #666; font-size: 14px; margin-top: 20px;">
                        Self-registration is disabled. Please contact an administrator for account creation.
                    </p>
                `;
            }
        }
        
        // Show RapidAPI info if enabled
        if (data.rapidApiEnabled) {
            const container = document.querySelector('.auth-container');
            const rapidApiInfo = document.createElement('div');
            rapidApiInfo.innerHTML = `
                <div style="background: #e7f3ff; border: 1px solid #b3d9ff; border-radius: 4px; padding: 10px; margin-top: 15px; font-size: 12px;">
                    <strong>RapidAPI Users:</strong> You can access the API directly using your RapidAPI headers without registration.
                </div>
            `;
            container.appendChild(rapidApiInfo);
        }
    } catch (error) {
        console.error('Failed to check registration status:', error);
    }
}

function toggleAuthMode(e) {
    e.preventDefault();
    
    if (!registrationEnabled) {
        showMessage('Registration is disabled. Please contact an administrator.', 'error');
        return;
    }
    
    isLoginMode = !isLoginMode;
    
    const title = document.getElementById('auth-title');
    const submit = document.getElementById('auth-submit');
    const switchText = document.getElementById('auth-switch-text');
    const toggle = document.getElementById('auth-toggle');
    
    if (isLoginMode) {
        title.textContent = 'Login';
        submit.textContent = 'Login';
        switchText.textContent = "Don't have an account?";
        toggle.textContent = 'Register';
    } else {
        title.textContent = 'Register';
        submit.textContent = 'Register';
        switchText.textContent = 'Already have an account?';
        toggle.textContent = 'Login';
    }
    
    clearMessage();
}

async function handleAuth(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showMessage('Please fill in all fields.', 'error');
        return;
    }
    
    if (!isLoginMode && !registrationEnabled) {
        showMessage('Registration is disabled. Please contact an administrator.', 'error');
        return;
    }
    
    const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
    
    console.log('Attempting auth:', { endpoint, username, isLoginMode });
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        console.log('Auth response status:', response.status);
        
        const data = await response.json();
        console.log('Auth response data:', data);
        
        if (response.ok) {
            if (isLoginMode) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', username);
                localStorage.setItem('isAdmin', data.isAdmin || false);
                showMessage('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
            } else {
                showMessage('Registration successful! Please login.', 'success');
                document.getElementById('username').value = '';
                document.getElementById('password').value = '';
                toggleAuthMode({ preventDefault: () => {} });
            }
        } else {
            showMessage(data.error || 'Authentication failed', 'error');
        }
    } catch (error) {
        console.error('Network error:', error);
        showMessage('Network error. Please try again.', 'error');
    }
}

function showMessage(text, type) {
    const message = document.getElementById('message');
    message.textContent = text;
    message.className = `message ${type}`;
    message.style.display = 'block';
}

function clearMessage() {
    const message = document.getElementById('message');
    message.style.display = 'none';
}

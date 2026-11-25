window.MediaApp = (() => {
  let library = null;
  let page = '';
  const thumbnailConcurrency = 2;
  const thumbnailMaxAttempts = 3;
  const thumbnailStates = new Map();
  const thumbnailQueue = [];
  const thumbnailProgressViews = new Map();
  let activeThumbnailJobs = 0;
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  } [c]));
  const formatBytes = bytes => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024,index)).toFixed(index ? 1 : 0)} ${units[index]}`;
  };
  const formatTimestamp = seconds => {
    const total = Math.max(0, Math.floor(seconds || 0));
    const hours = String(Math.floor(total / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const secs = String(total % 60).padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
  };
  const streamUrl = path => `php/api/stream.php?file=${encodeURIComponent(path)}`;
  async function loadLibrary() {
    const response = await fetch('php/api/videos.php');
    if (!response.ok) throw new Error('Could not scan the authorized directory.');
    library = await response.json();
    return library;
  }

  function sidebar() {
    const incognito = MediaStore.incognito();
    $('#incognitoIndicator')?.classList.toggle('visible', incognito);
  }

  function initShell() {
    sidebar();
    const prefs = MediaStore.prefs();
    if (prefs.fontSize) document.documentElement.style.setProperty('--site-font-size', `${prefs.fontSize}px`);
    MediaStore.dbGet('background', 'image').then(blob => {
      if (!(blob instanceof Blob)) return;
      const url = URL.createObjectURL(blob);
      document.body.style.backgroundImage = `linear-gradient(rgba(9,10,13,.${Number(prefs.backgroundOpacity || 72)}),rgba(9,10,13,.${Number(prefs.backgroundOpacity || 72)})),url("${url}")`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    }).catch(() => {});
    document.querySelectorAll('.search span').forEach(span => {
      span.innerHTML = '<img src="pictures/Search icon.jpg" alt="">';
    });
    document.querySelectorAll('.brand-mark').forEach(mark => {
      if (!mark.querySelector('img')) mark.innerHTML = '<img src="pictures/home.png" alt="MediaPlay">';
    });
    const nav = $('.nav');
    if (nav && !nav.querySelector('.incognito-menu')) {
      const button = document.createElement('button');
      button.className = 'incognito-menu';
      button.type = 'button';
      const sync = () => {
        button.classList.toggle('enabled', MediaStore.incognito());
        button.textContent = `◉ Incognito: ${MediaStore.incognito()?'ON':'OFF'}`
      };
      sync();
      button.addEventListener('click', () => {
        MediaStore.setIncognito(!MediaStore.incognito());
        sync();
        sidebar();
      });
      nav.appendChild(button);
      const help = document.createElement('a');
      help.href = 'help.html';
      help.textContent = '? Help Center';
      nav.appendChild(help);
    }
    initFloatingPlayer();
    $('.mobile-menu')?.addEventListener('click', () => $('#sidebar')?.classList.toggle('open'));

    const currentPage = location.pathname.split('/').pop();
    const currentCategory = new URLSearchParams(location.search).get('category');

    document.querySelectorAll('.nav a').forEach(link => {
      const url = new URL(link.href, location.href);
      const linkPage = url.pathname.split('/').pop();
      const linkCategory = url.searchParams.get('category');

      link.classList.remove('active');

      if (currentPage === 'player.html' && currentCategory) {
        if (linkPage === 'library.html' &&
          linkCategory === currentCategory) {
          link.classList.add('active');
        }
        return;
      }

      if (linkPage !== currentPage) return;

      if (currentPage === 'library.html') {
        if ((linkCategory || '') === (currentCategory || '')) {
          link.classList.add('active');
        }
      } else {
        link.classList.add('active');
      }
    });
    $('#searchInput')?.addEventListener('input', event => {
      window.dispatchEvent(new CustomEvent('mediaplay-search', {
        detail: event.target.value
      }));
    });
  }

  function folderName(record) {
    const parts = record.parent ? record.parent.split('/') : [];
    return parts[0] || 'Media';
  }

  function card(record, kind = 'video') {
    const title = record.name.replace(/\.[^.]+$/, '');
    return `<article class="card" data-path="${escapeHtml(record.path)}" data-kind="${kind}">
      <div class="thumb${kind === 'music' ? ' thumb-art' : ''}">${kind === 'music' ? '♫' : '▶'}</div>
      <div class="card-info">
        <div class="card-name">${escapeHtml(title)}</div>
        <div class="card-meta">${escapeHtml(record.type.toUpperCase())} · ${formatBytes(record.size)}</div>
      </div>
    </article>`;
  }

  function bindCards(container, kind = 'video') {
    container?.querySelectorAll('.card').forEach(cardEl => {
      if (kind !== 'music') applyCachedThumbnail(cardEl);

      cardEl.addEventListener('click', () => {
        const path = cardEl.dataset.path;

        if (kind === 'music') {
          window.location.href = `music.html?file=${encodeURIComponent(path)}`;
        } else {
          const category = new URLSearchParams(location.search).get('category');
          const categoryParam = category ?
            `&category=${encodeURIComponent(category)}` :
            '';

          window.location.href =
            `player.html?file=${encodeURIComponent(path)}${categoryParam}`;
        }
      });
    });
  }

  function updateThumbnailProgress() {
    for (const [container, view] of thumbnailProgressViews) {
      if (!container.isConnected) {
        thumbnailProgressViews.delete(container);
        continue;
      }
      let completed = 0;
      let failed = 0;
      for (const path of view.paths) {
        const status = thumbnailStates.get(path)?.status;
        if (status === 'complete') completed += 1;
        else if (status === 'failed') failed += 1;
      }
      const pending = Math.max(0, view.paths.size - completed - failed);
      view.element.textContent = `Thumbnails: ${completed} completed, ${pending} pending, ${failed} failed`;
    }
  }

  function updateThumbnailElements(state) {
    for (const thumb of state.elements) {
      if (!thumb.isConnected) {
        state.elements.delete(thumb);
        continue;
      }
      thumb.dataset.thumbnailStatus = state.status;
      thumb.classList.toggle('thumbnail-loading', state.status === 'checking' || state.status === 'pending' || state.status === 'generating');
      if (state.status === 'complete') {
        if (!state.url) state.url = URL.createObjectURL(state.blob);
        thumb.style.backgroundImage = `url("${state.url}")`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
        thumb.textContent = '';
      } else {
        thumb.style.backgroundImage = '';
        if (state.status === 'failed') {
          thumb.innerHTML = '<span class="thumbnail-placeholder">Thumbnail unavailable</span><button class="thumbnail-retry" type="button">Retry</button>';
          thumb.querySelector('.thumbnail-retry').addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            retryThumbnail(state.path);
          });
        } else {
          thumb.textContent = '▶';
        }
      }
    }
    updateThumbnailProgress();
  }

  function enqueueThumbnail(path, state) {
    if (state.queued || state.status !== 'pending') return;
    state.queued = true;
    thumbnailQueue.push({
      path,
      state
    });
    updateThumbnailProgress();
    pumpThumbnailQueue();
  }

  function pumpThumbnailQueue() {
    while (activeThumbnailJobs < thumbnailConcurrency && thumbnailQueue.length) {
      const {
        path,
        state
      } = thumbnailQueue.shift();
      state.queued = false;
      if (thumbnailStates.get(path) !== state || state.status !== 'pending') continue;
      state.status = 'generating';
      state.attempts += 1;
      activeThumbnailJobs += 1;
      updateThumbnailElements(state);
      createThumbnail(path)
        .then(async blob => {
          await MediaStore.dbSet('thumbnails', path, blob);
          state.blob = blob;
          state.status = 'complete';
        })
        .catch(error => {
          console.warn(`Thumbnail generation failed for "${path}" (attempt ${state.attempts}).`, error);
          if (thumbnailStates.get(path) === state && state.attempts < thumbnailMaxAttempts) {
            state.status = 'pending';
            const delay = 500 * state.attempts;
            state.retryTimer = setTimeout(() => {
              state.retryTimer = null;
              enqueueThumbnail(path, state);
            }, delay);
          } else if (thumbnailStates.get(path) === state) {
            state.status = 'failed';
          }
        })
        .finally(() => {
          activeThumbnailJobs -= 1;
          updateThumbnailElements(state);
          pumpThumbnailQueue();
        });
    }
  }

  function ensureThumbnail(path) {
    let state = thumbnailStates.get(path);
    if (state) return state;
    state = {
      path,
      status: 'checking',
      attempts: 0,
      elements: new Set(),
      queued: false,
      url: null
    };
    thumbnailStates.set(path, state);
    state.cachePromise = MediaStore.dbGet('thumbnails', path)
      .then(cached => {
        if (cached instanceof Blob) {
          state.blob = cached;
          state.status = 'complete';
          updateThumbnailElements(state);
          return;
        }
        state.status = 'pending';
        enqueueThumbnail(path, state);
        updateThumbnailElements(state);
      })
      .catch(error => {
        console.error(`Could not read the cached thumbnail for "${path}".`, error);
        state.status = 'pending';
        enqueueThumbnail(path, state);
        updateThumbnailElements(state);
      });
    return state;
  }

  function retryThumbnail(path) {
    const state = thumbnailStates.get(path);
    if (!state || state.status !== 'failed') return;
    state.attempts = 0;
    state.status = 'pending';
    enqueueThumbnail(path, state);
    updateThumbnailElements(state);
  }
  async function applyCachedThumbnail(cardEl, replace = false) {
    const path = cardEl.dataset.path;
    const thumb = cardEl.querySelector('.thumb');
    let state = thumbnailStates.get(path);
    if (replace && state) {
      if (state.retryTimer) clearTimeout(state.retryTimer);
      state = null;
      thumbnailStates.delete(path);
    }
    state = state || ensureThumbnail(path);
    state.elements.add(thumb);
    updateThumbnailElements(state);
    if (replace) {
      state.status = 'pending';
      state.attempts = 0;
      enqueueThumbnail(path, state);
      updateThumbnailElements(state);
    }
  }

  function createThumbnail(path) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      let phase = 'metadata';
      let targetTime = 0;
      let timer;
      let finished = false;
      const finish = (error, blob) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onloadeddata = null;
        video.onseeked = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
        if (error) reject(error);
        else resolve(blob);
      };
      const fallback = error => {
        if (finished) return;
        if (phase !== 'target') {
          finish(error);
          return;
        }
        phase = 'fallback';
        clearTimeout(timer);
        timer = setTimeout(() => finish(new Error('Video did not provide a frame at the fallback timestamp.')), 8000);
        try {
          video.currentTime = 0;
          if (video.readyState >= 2 && video.currentTime === 0) capture();
        } catch (fallbackError) {
          finish(fallbackError);
        }
      };
      const capture = () => {
        if (finished || video.readyState < 2 || (phase !== 'target' && phase !== 'fallback')) return;
        const capturedPhase = phase;
        phase = 'capturing';
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 480;
          canvas.height = 270;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas rendering is unavailable.');
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          timer = setTimeout(() => finish(new Error('Thumbnail encoding timed out.')), 5000);
          canvas.toBlob(blob => {
            if (blob) finish(null, blob);
            else if (capturedPhase === 'target') {
              phase = 'target';
              fallback(new Error('The selected video frame could not be encoded.'));
            } else {
              finish(new Error('The fallback video frame could not be encoded.'));
            }
          }, 'image/jpeg', .82);
        } catch (error) {
          finish(error);
        }
      };
      video.onloadedmetadata = () => {
        if (phase !== 'metadata') return;
        const duration = video.duration;
        targetTime = Number.isFinite(duration) && duration > 0 ?
          Math.max(0, Math.min(duration * .1, duration - .1)) :
          0;
        phase = 'target';
        timer = setTimeout(() => fallback(new Error('Video seek timed out.')), 8000);
        try {
          video.currentTime = targetTime;
          if (targetTime === 0 && video.readyState >= 2) capture();
        } catch (error) {
          fallback(error);
        }
      };
      video.onloadeddata = () => {
        if ((phase === 'target' && targetTime === 0) || (phase === 'fallback' && video.currentTime === 0)) capture();
      };
      video.onseeked = capture;
      video.onerror = () => fallback(new Error(video.error?.message || 'Video format is unsupported or could not be decoded.'));
      timer = setTimeout(() => finish(new Error('Video metadata loading timed out.')), 10000);
      video.src = streamUrl(path);
      video.load();
    });
  }

  function registerThumbnailProgress(container, records) {
    const element = container.querySelector('.thumbnail-progress');
    if (!element) {
      thumbnailProgressViews.delete(container);
      return;
    }
    thumbnailProgressViews.set(container, {
      element,
      paths: new Set(records.map(record => record.path)),
    });
    updateThumbnailProgress();
  }

  function renderLibraryGrid(container, records, kind = 'video') {
    const showThumbnailProgress = kind !== 'music';
    const progress = showThumbnailProgress ? '<div class="thumbnail-progress" role="status" aria-live="polite"></div>' : '';
    container.innerHTML = records.length ?
      `${progress}<div class="grid">${records.map(record => card(record, kind)).join('')}</div>` :
      `${progress}<div class="empty"><strong>No media found</strong><p>Select an authorized directory in Settings.</p></div>`;
    bindCards(container, kind);
    if (showThumbnailProgress) {
      const progressRecords = container.id === 'libraryContent' && library ? library.videos : records;
      registerThumbnailProgress(container, progressRecords);
    } else {
      registerThumbnailProgress(container, []);
    }
  }
  async function initIndex() {
    const response = await loadLibrary();
    const recent = MediaStore.history().filter(item => !item.completed).slice(0, 6);
    $('#continueContent').innerHTML = recent.length ?
      `<div class="grid">${recent.map(item => card(item)).join('')}</div>` :
      `<div class="empty">Nothing in continue watching yet.</div>`;
    bindCards($('#continueContent'));
    renderLibraryGrid($('#recentVideos'), [...response.videos].reverse().slice(0, 12));
  }
  async function initLibrary() {
    await loadLibrary();
    const container = $('#libraryContent');
    library.videos.forEach(record => ensureThumbnail(record.path));
    const category = new URLSearchParams(location.search).get('category');
    const title = category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Videos';
    if ($('#libraryTitle')) $('#libraryTitle').textContent = title;
    const render = query => {
      let records = [...library.videos];
      if (category) records = records.filter(v => (v.category || folderName(v)).toLowerCase() === category.toLowerCase());
      if (query) records = records.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));
      if (!category && !query) {
        const collections = new Map();
        records.forEach(record => {
          const name = folderName(record);
          if (!collections.has(name)) collections.set(name, {
            name,
            path: '',
            parent: name,
            size: 0,
            type: 'collection'
          });
        });
        container.innerHTML = `<div class="thumbnail-progress" role="status" aria-live="polite"></div>${collections.size?`<div class="grid">${[...collections.keys()].map(name=>`<article class="card collection-card" data-category="${escapeHtml(name)}"><div class="thumb">▣</div><div class="card-info"><div class="card-name">${escapeHtml(name)}</div><div class="card-meta">Collection</div></div></article>`).join('')}</div>`:'<div class="empty"><strong>No video collections found</strong></div>'}`;
        registerThumbnailProgress(container, library.videos);
        container.querySelectorAll('.collection-card').forEach(card => card.addEventListener('click', () => location.href = `library.html?category=${encodeURIComponent(card.dataset.category)}`));
      } else {
        renderLibraryGrid(container, records);
      }
    };
    render('');
    window.addEventListener('mediaplay-search', event => render(event.detail));
    $('#addMoreButton')?.addEventListener('click', async () => {
      if ('showDirectoryPicker' in window) {
        try {
          const handle = await window.showDirectoryPicker();
          await MediaStore.dbSet('folders', handle.name, handle);
          alert('Folder handle saved for this browser. For server streaming, also authorize the absolute folder path in Settings.');
        } catch (error) {
          if (error.name !== 'AbortError') alert('The browser could not open folder permissions.');
        }
      }
      location.href = 'settings.html';
    });
  }
  async function initMusic() {
    await loadLibrary();
    const container = $('#musicContent');
    const initial = new URLSearchParams(location.search).get('file');
    const render = query => {
      let records = [...library.music];
      if (library.categories && Object.prototype.hasOwnProperty.call(library.categories, 'music')) {
        records = records.filter(v => v.category === 'music');
      }
      if (query) records = records.filter(v => v.name.toLowerCase().includes(query.toLowerCase()));
      renderLibraryGrid(container, records, 'music');
    };
    render('');
    window.addEventListener('mediaplay-search', event => render(event.detail));
    if (initial) playAudio(initial);
  }
  async function initPlayer() {
    await loadLibrary();
    const path = new URLSearchParams(location.search).get('file');
    const params = new URLSearchParams(location.search);
    const category = params.get('category');
    const backToLibrary = $('#backToLibrary');

    if (backToLibrary) {
      backToLibrary.href = category ?
        `library.html?category=${encodeURIComponent(category)}` :
        'library.html';
    }
    const record = library.videos.find(v => v.path === path);
    if (!record) {
      $('#videoArea').innerHTML = '<div class="empty">Video could not be found in the authorized directory.</div>';
      return;
    }
    $('#videoTitle').textContent = record.name;
    $('#videoMeta').textContent = `${record.type.toUpperCase()} · ${formatBytes(record.size)} · ${record.parent || 'Root'}`;
    const video = $('#video');
    video.src = streamUrl(record.path);
    MediaApp.sharePlayerState(video);
    $('#refreshThumbnail').addEventListener('click', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 270;
      const context = canvas.getContext('2d');
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(async blob => {
          if (blob) {
            await MediaStore.dbSet('thumbnails', record.path, blob);
            alert('Thumbnail refreshed.')
          }
        }, 'image/jpeg', .82);
      } catch {
        alert('Could not capture a frame from this video.');
      }
    });
    const saved = MediaStore.history().find(v => v.path === record.path);
    video.addEventListener('loadedmetadata', () => {
      if (saved && saved.position > 5 && saved.position < video.duration - 10) video.currentTime = saved.position;
    });
    const save = () => MediaStore.saveProgress(record, video.currentTime, video.duration, video.duration > 0 && video.currentTime / video.duration >= .95);
    video.addEventListener('timeupdate', () => {
      if (Math.floor(video.currentTime) % 10 === 0) save();
    });
    video.addEventListener('pause', save);
    window.addEventListener('beforeunload', save);
    $('#favoriteButton').textContent = MediaStore.isFavorite(record.path) ? '★ Favorited' : '☆ Favorite';
    $('#favoriteButton').addEventListener('click', () => {
      MediaStore.toggleFavorite(record.path);
      $('#favoriteButton').textContent = MediaStore.isFavorite(record.path) ? '★ Favorited' : '☆ Favorite';
    });
    const bookmarkKey = `video:${record.path}`;
    const renderBookmarks = async () => {
      const values = (await MediaStore.dbGet('bookmarks', bookmarkKey)) || [];
      $('#bookmarkList').innerHTML = values.length ? values.map((item, index) => `<div class="bookmark-row" data-index="${index}" style="padding:8px 0;border-bottom:1px solid var(--line)"><button class="btn jump-bookmark" data-index="${index}">${formatTimestamp(item.time)} — ${escapeHtml(item.title)}</button><span style="margin-left:8px">${escapeHtml(item.note||'')}</span><button class="icon-btn edit-bookmark" data-index="${index}" title="Edit">✎</button><button class="icon-btn delete-bookmark" data-index="${index}" title="Delete">×</button></div>`).join('') : 'No bookmarks yet.';
      const markers = $('#timelineMarkers');
      if (markers) {
        markers.innerHTML = '';
        values.forEach(item => {
          if (!video.duration) return;
          const marker = document.createElement('button');
          marker.className = 'timeline-marker';
          marker.style.left = `${Math.min(100,100*item.time/video.duration)}%`;
          marker.title = `${formatTimestamp(item.time)} — ${item.title}`;
          marker.addEventListener('click', () => {
            video.currentTime = item.time;
            video.play().catch(() => {})
          });
          markers.appendChild(marker)
        })
      }
      $('#bookmarkList').querySelectorAll('.jump-bookmark').forEach(button => button.addEventListener('click', () => {
        video.currentTime = values[Number(button.dataset.index)].time;
        video.play().catch(() => {})
      }));
      $('#bookmarkList').querySelectorAll('.delete-bookmark').forEach(button => button.addEventListener('click', async () => {
        const next = values.filter((_, i) => i !== Number(button.dataset.index));
        await MediaStore.dbSet('bookmarks', bookmarkKey, next);
        renderBookmarks()
      }));
      $('#bookmarkList').querySelectorAll('.edit-bookmark').forEach(button => button.addEventListener('click', async () => {
        const index = Number(button.dataset.index);
        const title = prompt('Bookmark title', values[index].title);
        if (title === null) return;
        const note = prompt('Optional note', values[index].note || '') ?? '';
        values[index] = {
          ...values[index],
          title: title.trim() || values[index].title,
          note
        };
        await MediaStore.dbSet('bookmarks', bookmarkKey, values);
        renderBookmarks()
      }));
    };
    $('#addBookmark').addEventListener('click', async () => {
      const values = (await MediaStore.dbGet('bookmarks', bookmarkKey)) || [];
      const title = $('#bookmarkTitle').value.trim();
      if (!title) {
        alert('Enter a bookmark title.');
        return;
      }
      values.push({
        time: video.currentTime,
        title,
        note: $('#bookmarkNote').value.trim()
      });
      values.sort((a, b) => a.time - b.time);
      await MediaStore.dbSet('bookmarks', bookmarkKey, values);
      $('#bookmarkTitle').value = '';
      $('#bookmarkNote').value = '';
      renderBookmarks();
    });
    document.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'b' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        $('#addBookmark').click()
      }
    });
    renderBookmarks();
    const siblingIndex = library.videos.findIndex(v => v.path === record.path);
    const playlistIndex = Number(new URLSearchParams(location.search).get('playlist'));
    const playlist = !Number.isNaN(playlistIndex) && MediaStore.playlists()[playlistIndex] ? MediaStore.playlists()[playlistIndex] : null;
    const playlistUrl = target =>
      `player.html?file=${encodeURIComponent(target.path)}&playlist=${playlistIndex}` +
      (category ? `&category=${encodeURIComponent(category)}` : '');
    const getTargets = () => playlist?.items?.length ? playlist.items : library.videos;
    const getSiblingIndex = () => {
      const targets = getTargets();
      return targets.findIndex(v => v.path === record.path)
    };
    const navigate = (direction) => {
      const targets = getTargets();
      if (!targets.length) return;
      let index = getSiblingIndex();
      if (index < 0) index = 0;
      index = (index + direction + targets.length) % targets.length;
      const target = targets[index];
      location.href = playlist ?
        playlistUrl(target) :
        `player.html?file=${encodeURIComponent(target.path)}` +
        (category ? `&category=${encodeURIComponent(category)}` : '');
    };
    $('#previousVideo').addEventListener('click', () => {
      navigate(-1);
    });
    $('#nextVideo').addEventListener('click', () => {
      navigate(1);
    });
    video.addEventListener('ended', () => {
      if (playlist) {
        const targets = getTargets();
        const index = getSiblingIndex();
        if (index >= 0 && index < targets.length - 1) navigate(1);
        else if ($('#playlistRepeat')?.checked) navigate(1);
      }
    });
    $('#addPlaylistButton').addEventListener('click', () => {
      let playlists = MediaStore.playlists();
      if (!playlists.length) {
        const name = prompt('Create a playlist name');
        if (!name?.trim()) return;
        playlists.push({
          name: name.trim(),
          items: []
        });
      }
      const choices = playlists.map((p, i) => `${i+1}. ${p.name}`).join('\n');
      const choice = prompt(`Choose a playlist:\n${choices}\nEnter a number`);
      const index = Number(choice) - 1;
      if (!playlists[index]) return;
      if (!playlists[index].items.some(item => item.path === record.path)) {
        playlists[index].items.push(record);
      }
      MediaStore.savePlaylists(playlists);
      alert(`Added to ${playlists[index].name}`);
    });
    initSubtitles(video, record);
  }
  async function initSubtitles(video, record) {
    const response = await fetch(`php/api/subtitles.php?file=${encodeURIComponent(record.path)}`);
    const data = await response.json();
    const select = $('#subtitleSelect');
    data.subtitles.forEach(sub => {
      const option = document.createElement('option');
      option.value = sub.path;
      option.textContent = sub.name;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      for (const track of video.textTracks) track.mode = 'hidden';
      const old = video.querySelector('track');
      if (old) old.remove();
      if (!select.value) return;
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = 'External subtitles';
      track.src = streamUrl(select.value);
      track.default = true;
      video.appendChild(track);
      track.addEventListener('load', () => {
        if (video.textTracks[0]) video.textTracks[0].mode = 'showing';
      });
    });
  }

  function playAudio(path) {
    const record = library.music.find(v => v.path === path);
    if (!record) return;
    const player = $('#miniPlayer');
    const audio = $('#audio');
    player.hidden = false;
    audio.src = streamUrl(record.path);
    if (MediaApp.sharePlayerState) MediaApp.sharePlayerState(audio);
    $('#audioTitle').textContent = record.name.replace(/\.[^.]+$/, '');
    $('#audioMeta').textContent = `${record.type.toUpperCase()} · ${record.parent || 'Root'}`;
    audio.play().catch(() => {});
  }
  async function initFavorites() {
    await loadLibrary();
    const records = library.videos.concat(library.music).filter(v => MediaStore.isFavorite(v.path));
    renderLibraryGrid($('#favoritesContent'), records, 'video');
  }
  async function initHistory() {
    await loadLibrary();
    const container = $('#historyContent');
    const render = () => {
      const values = MediaStore.history();
      container.innerHTML = values.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Folder</th><th>Progress</th><th></th></tr></thead><tbody>${values.map(v => `<tr data-path="${escapeHtml(v.path)}"><td>${escapeHtml(v.name)}</td><td>${escapeHtml(v.parent || 'Root')}</td><td>${v.completed ? 'Completed' : `${Math.round((v.position / (v.duration || 1)) * 100)}%`}</td><td><button class="icon-btn remove-history" data-path="${escapeHtml(v.path)}">×</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Watch history is empty.</div>';
      container.querySelectorAll('tbody tr').forEach(row => row.addEventListener('click', () => {
        if (library.videos.some(v => v.path === row.dataset.path)) location.href = `player.html?file=${encodeURIComponent(row.dataset.path)}`;
      }));
      container.querySelectorAll('.remove-history').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        MediaStore.removeHistory(button.dataset.path);
        render();
      }));
    };
    render();
  }
  async function initSettings() {
    const response = await fetch('php/api/folders.php');
    const data = await response.json();
    const labels = {
      movies: 'Movies',
      anime: 'Anime',
      series: 'Series',
      music: 'Music'
    };
    const container = $('#categoryFolders');
    container.innerHTML = Object.entries(labels).map(([category, label]) => `
      <div class="category-folder panel" style="margin-top:10px;padding:12px">
        <h3 style="margin:0 0 8px">${label}</h3>
        <div class="notice category-root" data-category="${category}">${escapeHtml(data.categories?.[category]||'No folder authorized')}</div>
        <div class="field" style="margin-top:8px"><input class="category-input" data-category="${category}" placeholder="Absolute ${label} folder path"><button class="btn btn-primary category-authorize" data-category="${category}">Authorize</button><button class="btn category-remove" data-category="${category}">Remove</button></div>
      </div>`).join('');
    container.querySelectorAll('.category-authorize').forEach(button => button.addEventListener('click', async () => {
      const category = button.dataset.category;
      const input = container.querySelector(`.category-input[data-category="${category}"]`);
      const res = await fetch('php/api/folders.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category,
          root: input.value.trim()
        })
      });
      const result = await res.json();
      if (result.ok) {
        location.reload()
      } else {
        alert(result.error || 'Could not authorize the directory.')
      }
    }));
    container.querySelectorAll('.category-remove').forEach(button => button.addEventListener('click', async () => {
      if (!confirm(`Remove the ${labels[button.dataset.category]} folder authorization?`)) return;
      await fetch('php/api/folders.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'remove-category',
          category: button.dataset.category
        })
      });
      location.reload();
    }));
    $('#clearRootButton')?.addEventListener('click', async () => {
      await fetch('php/api/settings.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'clear'
        })
      });
      location.reload();
    });
  }

  function initCommonControls() {
    $('#incognitoToggle')?.addEventListener('change', event => {
      MediaStore.setIncognito(event.target.checked);
      location.reload();
    });
  }

  function initFloatingPlayer() {
    if (document.querySelector('.floating-player')) return;
    const state = JSON.parse(sessionStorage.getItem('mediaplayMini') || 'null');
    if (!state?.src) return;
    const box = document.createElement('section');
    box.className = 'floating-player';
    box.innerHTML = `<div class="floating-head"><strong>Mini Player</strong><div><button data-action="minimize" class="icon-btn">−</button><button data-action="close" class="icon-btn">×</button></div></div><video controls playsinline></video>`;
    document.body.appendChild(box);
    const video = box.querySelector('video');
    video.src = state.src;
    video.currentTime = Number(state.time) || 0;
    video.volume = Number(state.volume) || 1;
    if (state.playing) video.play().catch(() => {});
    const save = () => sessionStorage.setItem('mediaplayMini', JSON.stringify({
      src: video.src,
      time: video.currentTime,
      volume: video.volume,
      playing: !video.paused
    }));
    video.addEventListener('timeupdate', save);
    video.addEventListener('volumechange', save);
    box.querySelector('[data-action="close"]').addEventListener('click', () => {
      save();
      sessionStorage.removeItem('mediaplayMini');
      box.remove();
    });
    box.querySelector('[data-action="minimize"]').addEventListener('click', () => box.classList.toggle('minimized'));
  }

  function sharePlayerState(video) {
    const save = () => sessionStorage.setItem('mediaplayMini', JSON.stringify({
      src: video.currentSrc || video.src,
      time: video.currentTime,
      volume: video.volume,
      playing: !video.paused
    }));
    video.addEventListener('timeupdate', save);
    video.addEventListener('play', save);
    video.addEventListener('pause', save);
    video.addEventListener('volumechange', save);
  }
  return {
    initShell,
    initIndex,
    initLibrary,
    initMusic,
    initPlayer,
    initFavorites,
    initHistory,
    initSettings,
    initCommonControls,
    renderLibraryGrid,
    card,
    bindCards,
    streamUrl,
    loadLibrary,
    sharePlayerState
  };
})();
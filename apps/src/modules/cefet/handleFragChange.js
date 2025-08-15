const COLOR = [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];

function handleFragChange(segnumber, segname) {
    if (!COLOR[0] && segnumber < 11) {
        COLOR[0] = true;
        console.log('inicia luz variando de cores');
    }
    else if (COLOR[0] && segnumber >= 11) {
        COLOR[0] = false;
        console.log('termina luz variando de cores');
    }

    else if (!COLOR[1] && segnumber > 11 && segnumber < 65) {
        COLOR[1] = true;
        console.log('inicia luz banca');
    }
    else if (COLOR[1] && segnumber >= 65) {
        COLOR[1] = false;
        console.log('termina luz banca');
    }

    else if (!COLOR[2] && segnumber > 65 && segnumber < 104) {
        COLOR[2] = true;
        console.log('termina luz banca');
        console.log('inicia luz vermelha');
    }
    else if (COLOR[2] && segnumber >= 104) {
        COLOR[2] = false;
        console.log('termina luz vermelha');
    }
    
    else if (!COLOR[3] && segnumber > 104 && segnumber < 141) {
        COLOR[3] = true;
        console.log('inicia luz vermelha escura');
    }
    else if (COLOR[3] && segnumber >= 141) {
        COLOR[3] = false;
        console.log('termina luz vermelha escura');
    }
    
    else if (!COLOR[4] && segnumber > 141 && segnumber < 173) {
        COLOR[4] = true;
        console.log('inicia luz azul escura');
    }
    else if (COLOR[4] && segnumber >= 173) {
        COLOR[4] = false;
        console.log('termina luz azul escura');
    }
    
    else if (!COLOR[5] && segnumber > 173 && segnumber < 239) {
        COLOR[5] = true;
        console.log('inicia luz preta');
    }
    else if (COLOR[5] && segnumber >= 239) {
        COLOR[5] = false;
        console.log('termina luz preta');
    }
    
    else if (!COLOR[6] && segnumber > 239 && segnumber < 492) {
        COLOR[6] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[6] && segnumber >= 492) {
        COLOR[6] = false;
        console.log('termina luz branca');
    }
    
    else if (!COLOR[7] && segnumber > 492 && segnumber < 529) {
        COLOR[7] = true;
        console.log('inicia luz amarela');
    }
    else if (COLOR[7] && segnumber >= 529) {
        COLOR[7] = false;
        console.log('termina luz amarela');
    }
    
    else if (!COLOR[8] && segnumber > 529 && segnumber < 539) {
        COLOR[8] = true;
        console.log('inicia luz vermelho escuro');
    }
    else if (COLOR[8] && segnumber >= 539) {
        COLOR[8] = false;
        console.log('termina luz vermelho escuro');
    }
    
    else if (!COLOR[9] && segnumber > 539 && segnumber < 543) {
        COLOR[9] = true;
        console.log('inicia luz azul');
    }
    else if (COLOR[9] && segnumber >= 543) {
        COLOR[9] = false;
        console.log('termina luz azul');
    }
    
    else if (!COLOR[10] && segnumber > 543 && segnumber < 609) {
        COLOR[10] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[10] && segnumber >= 609) {
        COLOR[10] = false;
        console.log('termina luz branca');
    }
    
    else if (!COLOR[11] && segnumber > 609 && segnumber < 637) {
        COLOR[11] = true;
        console.log('inicia luz amarela');
    }
    else if (COLOR[11] && segnumber >= 637) {
        COLOR[11] = false;
        console.log('termina luz amarela');
    }
    
    else if (!COLOR[12] && segnumber > 637 && segnumber < 724) {
        COLOR[12] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[12] && segnumber >= 724) {
        COLOR[12] = false;
        console.log('termina luz branca');
    }

    else if (!COLOR[13] && segnumber > 724 && segnumber < 738) {
        COLOR[13] = true;
        console.log('inicia luz azul');
    }
    else if (COLOR[13] && segnumber >= 738) {
        COLOR[13] = false;
        console.log('termina luz azul');
    }
    
    else if (!COLOR[14] && segnumber > 738 && segnumber < 776) {
        COLOR[14] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[14] && segnumber >= 776) {
        COLOR[14] = false;
        console.log('termina luz branca');
    }
    
    else if (!COLOR[15] && segnumber > 776 && segnumber < 787) {
        COLOR[15] = true;
        console.log('inicia luz azul');
    }
    else if (COLOR[15] && segnumber >= 787) {
        COLOR[15] = false;
        console.log('termina luz azul');
    }
    
    else if (!COLOR[16] && segnumber > 787 && segnumber < 893) {
        COLOR[16] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[16] && segnumber >= 893) {
        COLOR[16] = false;
        console.log('termina luz branca');
    }
    
    else if (!COLOR[17] && segnumber > 893 && segnumber < 912) {
        COLOR[17] = true;
        console.log('inicia luz preta');
    }
    else if (COLOR[17] && segnumber >= 912) {
        COLOR[17] = false;
        console.log('termina luz preta');
    }
    
    else if (!COLOR[18] && segnumber > 912 && segnumber < 928) {
        COLOR[18] = true;
        console.log('inicia luz branca');
    }
    else if (COLOR[18] && (segnumber >= 928 || segnumber < 912)) {
        COLOR[18] = false;
        console.log('termina luz branca');
    }
}
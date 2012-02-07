<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>Bobcats</title>
<meta http-equiv="content-type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" type="text/css" href="css/main.css" />
<script type="text/javascript" src="js/main.js"></script>
</head>
<body class="oneColElsCtr" onLoad="setPastGamesDisplayPref('pastGamesOnIndexPage')">

<div id="container">
  <div id="mainContent">
    <div class="style1">
    <h1>Bobcats Game Schedule</h1>

<p class="link-row"><span class ="style1"><a href="index.php">home</a> | <a href="players.php">manage roster</a> | <a href="games.php">manage games</a></p>

<p>


<?php 


error_reporting(E_ALL);
ini_set('display_errors', true);



// convert integer to word

function num_word ($number) {
    $num_array=array('zero','one','two','three','four','five','six','seven','eight','nine', 'ten',
                     'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
                     'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three',
                     'twenty-four', 'twenty-five', 'twenty-six', 'twenty-seven', 'twenty-eight',
                     'twenty-nine', 'thirty');
    return $num_array[$number];    // we're assuming it's an integer.
}
   
   
// determine whether a word should be singular or plural   
 
function sing_plur ($number, $singular_str) {
	if ($number == 1) {
		return $singular_str;
	}
	else {
		switch ($singular_str) {
			
			case "woman" :
			return 'women';
			break;
			
			case "man" :
			return 'men';
			break;
			
			case "player" :
			return 'players';
			break;
		}
	}
}


function printplayer($player_id, $game_id) {
	// this prints an individual player line and is called by the
	// printgame() function.  It returns TRUE if the 
	// player is attending the game.
    
    
    // Join the bobcats_player and bobcats_attendance tables to get player name and attendance id and status.

    $green = "#009900";
    $red = "#CC0000";
    $yellow = "#FF9900";
    $black = "#000000";
//    $grey = "#444444";

	  $sql = "SELECT bobcats_player.name, bobcats_attendance.status, bobcats_attendance.id " .
           "FROM bobcats_player, bobcats_attendance " .
	 	       "WHERE bobcats_player.id = '$player_id' " .
	  	     "AND bobcats_attendance.player_id = '$player_id' " .
	 	       "AND bobcats_attendance.game_id = '$game_id'";
    
    if (!$result=@mysql_query($sql)) {
	    echo '<p>Error accessing game database for printplayer function: ' .
          mysql_error() . '</p>';
    }
    
    $row = @mysql_fetch_array($result);      //only one row
    	
    $name = htmlspecialchars($row['name']);
    $status = $row['status'];
    $id = $row['id'];
    	
    	
    echo "<p class=\"list1\">";
    	 
    switch ($status) {

    	case "yes" :
    	echo "$name <span class=\"player-coming\">will be playing</span>. ";
    	break;
    		
    	case "no" :
    	echo "$name <span class=\"player-not-coming\">will not be playing</span>. ";
    	break;
    		
    	case "not_sure" :
    	echo "$name <span class=\"player-maybe\">isn't sure</span>. ";
    	break;
    	
    	case "no_response" :  
    	echo "$name <span class=\"player-not-responded\">hasn't responded yet</span>. ";
    	break;
    }
   	echo "<span class=\"style2\"><a href=\"changeattendance.php" .
    	 "?id=$id\">" . 
    	 "Edit</a></span></p>";
    	 
    return ($status=='yes');     	
}
    		 
 


function printgame($game_id) {
	// take the game id and print out a header for the game, followed by a while
	// loop which prints each player (which will be a function).  Each game will
	// follow the same pattern except the last one, so that will be an exception.
	// It is the playoffs.
	
	// Then we have to have the summary at the bottom of how many players we need
	// and stuff.  This has to be counted up during the printing of the players.

	$sql = "SELECT unixtimestamp, name, color " .
			"FROM bobcats_game WHERE id='$game_id'";
    if (!$result=@mysql_query($sql)) {
      echo '<p>Error accessing game database for printgame function: ' .
          mysql_error() . '</p>';
    }

    // Display header for game
    
    $row = @mysql_fetch_array($result);  // only one row.
   
    $date = date('l, F j, Y', $row['unixtimestamp']);  // Sunday, January 5, 2010
    $time = date('g:i a', $row['unixtimestamp']);  // 6:07 pm
    $name = htmlspecialchars($row['name']);
    $color = htmlspecialchars($row['color']);
    

	echo "<p><span class=\"style3\"><strong>$date";
	
	if ($name == NULL) { 
		echo ". </strong></span><span class=\"style4\">Bye week.</span></p>";
	}
	else {
		echo " </strong></span><span class=\"style4\">at $time against $name";
		if ($color) {
			echo " (the $color team)";
		}
		echo ":</span></p>";
		
		$sql = "SELECT id, gender FROM bobcats_player ORDER BY name";
		if (!$result=@mysql_query($sql)) {
           echo '<p>Error accessing game database for printgame function inside else loop: ' .
                    mysql_error() . '</p>';
		}
		
        // Print each player's status.

		$males=0;
		$females=0;
		$min_players=7;  // max_players and min_females will eventually be user input
		$min_females=2;
		while ($row = mysql_fetch_array($result)) {
	       $player_id=$row['id'];
	       $player_gender=$row['gender'];
	       if (printplayer ($player_id, $game_id)) {  // returns true if they're coming to the game
	       		if ($player_gender == 'f') {
	       	 		$females++;
	     		}
	     		else {
	     			$males++;
	     		}
	       }
	       	
	    }


		// Make roster report for the game.
		
		$players = $females + $males;
		$players_needed = $min_players - $players;
		$females_needed = $min_females - $females;
		if ($players_needed < $females_needed) {
			$players_needed = $females_needed;
		}
		
		// Prepare first sentence of report (we have 5 boys and 6 girls for a total of 11 players):
		
		$report = "<p>So far we have ";
		if ($min_females > 0) {  // if there is a co-ed rule at all
			$report = $report . "<strong>" . num_word($females) . "</strong> " . 
								sing_plur($females,'woman') . " and <strong>" . num_word($males) . 
								"</strong> " . sing_plur($males,'man') . ", for a total of ";
		}
		$report = $report . "<strong>" . num_word($players) . "</strong> " . 
							sing_plur($players,'player') . ".</p>"; 
				
		// Prepare and add second sentence of report (what we need for a full roster):
		
		// if we have enough to play but have not filled our women's quota
		if (($players >= $min_players) AND ($females_needed > 0)) {       
			$report = $report . "<p>We need <strong>" . num_word($females_needed) . 
		              "</strong> more " . sing_plur($females_needed,'woman') . ".</p>";
		}
		
		// if we have less than a full roster of players, regardless of gender
		else if ($players_needed > 0) {      
			$report = $report . "<p>At a minimum we need <strong>" . num_word($players_needed) . 
				      "</strong> more " . sing_plur($players_needed, 'player');
			
			// Here's where it gets grammatically hairy
			if ($females_needed > 0) {
				if ($females_needed == $players_needed) {
					switch ($females_needed) {
						case 1:
							$report = $report . ", who ";
							break;
						case 2:
							$report = $report . ", <strong>both</strong> of whom ";
							break;
						default:
							$report = $report . ", <strong>all</strong> of whom ";
					}
				}
				else { // if there are fewer women needed than total players needed
					$report = $report . ", <strong>" . num_word($females_needed) . 
					          "</strong> of whom ";
				}
				$report = $report . "must be female";
			}

			$report = $report . ".</p>";
		}
		
		// note that the preceding block adds nothing if we have enough players and women.
		
		// print report
		echo $report;
	}
	echo "<p>&nbsp;</p>";
}



// main block

$dbcnx = @mysql_connect('mysql50-36.wc1.dfw1.stabletransit.com', '496492_th', 'Krul6666');
if (!$dbcnx) {
  exit('<p>Unable to connect to the ' .
      'database server at this time.</p>');
}
 // Select the badgers database
if (!@mysql_select_db('496492_turtlemaster')) {
  exit('<p>Unable to locate the master ' .
      'database at this time.</p>');
}


// If an attendance entry has been edited,
// update the database.
if (isset($_GET['has_changed'])) {
  $attendance_status = $_GET['attendance_status'];
  $attendance_id = $_GET['attendance_id'];
  $sql = "UPDATE bobcats_attendance SET " .
         "status='$attendance_status' " .
         "WHERE id='$attendance_id'";
  if (@mysql_query($sql)) {
// I commented out this line because it's kind of stupid and just gets in the way and confuses the user.
//    echo '<p>Your status has been updated.</p>';
  } else {
    echo '<p>Error updating status: ' .
        mysql_error() . '</p>';
  }
}








// Check to see whether the user has clicked on the "show past games" or "hide past games"
// links from this page, and set the $show_past_games variable accordingly.  Default is FALSE.
// Then display the appropriate link (the one which will toggle the current status).

?>

<p><span class ="style1"><a href="#" id="togglePastGamesID" onClick="togglePastGames('pastGamesOnIndexPage')">Show past games</a></span></p>

<?php


// Display each game (except ones in the past if show_past_games is false.)
$result = @mysql_query('SELECT id, unixtimestamp FROM bobcats_game ORDER BY unixtimestamp ASC');
if (!$result) {
  exit('<p>Error performing query: ' .
	   mysql_error() . '</p>');
}

// This is for setting up the system to figure out where to display the "Past games" and 
// "future games" headings, if we need them.
$this_is_the_first_past_game = TRUE;
$this_is_the_first_future_game = TRUE;
$this_game_is_in_the_future = FALSE;
echo ('<div id="pastGames" class="hiding">');
while ($row = mysql_fetch_array($result)) {
    $this_game_is_in_the_future = ($row['unixtimestamp'] > time());
    if ($this_is_the_first_past_game AND !$this_game_is_in_the_future) { 
   		echo '<p><span class="style3"><strong>Past games:</strong></span></p>';
   		$this_is_the_first_past_game = FALSE;  // toggle this_is_the_first_past_game off
   	}
   	else if ($this_is_the_first_future_game AND $this_game_is_in_the_future) {
   		// If there were no past games, then this_is_the_first_past_game never got turned off
   		if ($this_is_the_first_past_game) { 
   			echo '<p><span class="style3"><strong>No past games.</strong></span></p>';
   			// We don't need to turn off $this_is_the_first_past_game because it'll never be checked again now 
   			// that $this_game_is_in_the_future is true.
   		}
   		echo '</div>';
   		echo '<p><span class ="style3"><strong>Future games:</strong></span></p>';
   		$this_is_the_first_future_game = FALSE;
   	}
    printgame ($row['id']);
}
// If there were no future games, 
// $this_game_is_in_the_future will never have been set to true.  In that case,
// this if statement needs to be executed so we can close the div tag.
if (!$this_game_is_in_the_future) {
    echo '</div>';
}
    


?>


<br />


</div>
</div>
</div>
</body>
</html>